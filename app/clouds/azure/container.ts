import { DnsARecord } from "@cdktn/provider-azurerm/lib/dns-a-record";

import {
  azureAcaConfigs,
  azureAcaEnvironmentDefaults,
  azureAcaEnvironmentSettings,
  azureAppGwConfigs,
} from "../../config/azure/azuresettings";
import { isFeatureEnabled } from "../../config/features";
import { createAzureContainerAppResources } from "../../constructs/container/azureaca";
import {
  createAzureAcaPrivateDnsResources,
} from "../../constructs/dns/privatezone/azureprivatezone";
import { createAzureAppGwResources } from "../../constructs/loadbalancer/azureappgw";
import { AzureAppGwResourcesWithDns } from "./types";
import { LoadBalancerDnsInfo } from "../common";
import { resourceName } from "../../utils/naming";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { AzureBuildContext } from "./context";
import { ContainerAppEnvironment } from "@cdktn/provider-azurerm/lib/container-app-environment";

/** 6-7. Container Apps, Application Gateway and DNS A-records (feature: containers) */
export function createAzureContainers(ctx: AzureBuildContext): void {
  const { scope, azureProvider, output, azureVnetResources, publicZones, acrRegistryMap, containerApps, azureMonitor, logArchive } = ctx;

  // ──────────────────────────────────────────────
  // 6. ACA + AppGW  (features.containers)
  // ──────────────────────────────────────────────
  if (isFeatureEnabled("azure", "containers")) {
    if (!azureAcaConfigs) {
      // no container config – skip
    } else {
      // 6a. ACA
      const envMap = new Map<string, ContainerAppEnvironment>();
      const acaFqdnMap = new Map<string, string>();
      const internalEnvDnsMap = new Map<
        string,
        { defaultDomain: string; staticIpAddress: string; apps: string[] }
      >();
      const acaInstancesMeta: Array<{ cnameRecordName: string; fqdn: string }> =
        [];

      azureAcaConfigs
        .filter((c) => c.build)
        .forEach((config) => {
          const subnet = config.subnetName
            ? azureVnetResources.subnets[config.subnetName]
            : undefined;

          const envSettings = {
            ...azureAcaEnvironmentDefaults,
            ...azureAcaEnvironmentSettings[config.environmentName],
          };
          const workspaceId = azureMonitor?.logAnalyticsWorkspace?.id;
          if (envSettings.logs && !workspaceId) {
            throw new Error(
              `Container Apps environment "${config.environmentName}" logs need the ` +
                `Log Analytics Workspace: set azureMonitorConfig.isEnabled to true, or logs ` +
                `to false (azureAcaEnvironmentSettings in config/azure/containerapps.ts).`,
            );
          }

          const aca = createAzureContainerAppResources(
            scope,
            azureProvider,
            {
              ...config,
              infrastructureSubnetId: subnet?.id,
              environmentLogs:
                envSettings.logs && workspaceId
                  ? {
                      logAnalyticsWorkspaceId: workspaceId,
                      diagnosticSettingName: resourceName(
                        envSettings.diagnosticSettingName,
                        "azure",
                        "aca-env-diagnostic-setting",
                        config.environmentName,
                      ),
                      archiveStorageAccountId: logArchive?.environments.includes(
                        config.environmentName,
                      )
                        ? logArchive.storageAccount.id
                        : undefined,
                    }
                  : undefined,
            },
            envMap,
          );

          acrRegistryMap.forEach((registry) => {
            addTerraformDependency(aca.app, registry);
          });

          containerApps.set(config.name, aca.app);

          if (aca.fqdn) {
            acaFqdnMap.set(config.name, aca.fqdn);
          }

          // Collect for Private DNS Zone (internal ACA)
          if (config.internal === true && aca.environment) {
            const envName = config.environmentName;
            const existing = internalEnvDnsMap.get(envName);
            if (existing) {
              existing.apps.push(config.name);
            } else {
              internalEnvDnsMap.set(envName, {
                defaultDomain: aca.environment.defaultDomain,
                staticIpAddress: aca.environment.staticIpAddress,
                apps: [config.name],
              });
            }
          }

          // Collect ACA FQDN metadata for Private Zone
          if (config.cnameRecordName && aca.fqdn) {
            acaInstancesMeta.push({
              cnameRecordName: config.cnameRecordName,
              fqdn: aca.fqdn,
            });
          }
        });

      output.acaInstances = acaInstancesMeta;

      // Private DNS Zones for internal ACA environments
      const vnetId = azureVnetResources.vnet.id;
      internalEnvDnsMap.forEach((envDns, envName) => {
        const envConfig = azureAcaConfigs.find(
          (c) => c.build && c.environmentName === envName,
        );
        if (envConfig) {
          createAzureAcaPrivateDnsResources(scope, azureProvider, {
            resourceGroupName: envConfig.resourceGroupName,
            virtualNetworkId: vnetId,
            defaultDomain: envDns.defaultDomain,
            staticIpAddress: envDns.staticIpAddress,
            apps: envDns.apps,
            vnetLinkName: envConfig.privateDnsVnetLinkName,
          });
        }
      });

      // 6b. AppGW (injects ACA FQDNs into backend pools)
      if (azureAppGwConfigs) {
        const azureAppGws: AzureAppGwResourcesWithDns[] = azureAppGwConfigs
          .filter((config) => config.build)
          .map((config) => {
            const subnet = azureVnetResources.subnets[config.subnetName];
            if (!subnet) {
              throw new Error(
                `Subnet ${config.subnetName} not found for Azure AppGW`,
              );
            }

            const backendsWithResolvedFqdns = config.backends.map((be) => {
              const originalFqdns: string[] = be.targetFqdns ?? [];
              const resolvedFqdns = originalFqdns.map((nameOrFqdn: string) => {
                const resolvedFqdn = acaFqdnMap.get(nameOrFqdn);
                return resolvedFqdn ?? nameOrFqdn;
              });
              return resolvedFqdns.length > 0
                ? { ...be, targetFqdns: resolvedFqdns }
                : be;
            });

            const resources = createAzureAppGwResources(scope, azureProvider, {
              ...config,
              backends: backendsWithResolvedFqdns,
              subnetId: subnet.id,
            });

            addTerraformDependency(resources.appGw, azureVnetResources.subnets);

            if (azureVnetResources.nsgs) {
              Object.values(azureVnetResources.nsgs).forEach((nsg) => {
                addTerraformDependency(resources.appGw, nsg);
              });
            }

            if (azureVnetResources.nsgRules) {
              Object.values(azureVnetResources.nsgRules)
                .flat()
                .forEach((rule) => {
                  addTerraformDependency(resources.appGw, rule);
                });
            }

            if (azureVnetResources.subnetAssociations) {
              azureVnetResources.subnetAssociations.forEach((association) => {
                addTerraformDependency(resources.appGw, association);
              });
            }

            azureAcaConfigs
              .filter((c) => c.build)
              .forEach((acaConfig) => {
                const env = envMap.get(acaConfig.environmentName);
                if (env) {
                  addTerraformDependency(resources.appGw, env);
                }
              });

            const dnsInfo: LoadBalancerDnsInfo = {
              subdomain: config.dnsConfig?.subdomain || "",
              fqdn: config.dnsConfig?.fqdn,
            };

            return { ...resources, dnsInfo };
          });

        output.lbs = azureAppGws;

        // ──────────────────────────────────────────────
        // 7. DNS A-records
        // ──────────────────────────────────────────────
        if (isFeatureEnabled("azure", "dns")) {
          const extractHostName = (
            fqdn: string | undefined,
            zoneName: string,
          ): string => {
            if (!fqdn) return "@";
            const f = fqdn.toLowerCase().replace(/\.$/, "");
            const z = zoneName.toLowerCase().replace(/\.$/, "");
            if (f === z) return "@";
            const zoneIndex = f.lastIndexOf("." + z);
            if (zoneIndex !== -1) return f.substring(0, zoneIndex);
            return f.split(".")[0];
          };

          azureAppGws.forEach((appGw, index) => {
            const zone = publicZones[appGw.dnsInfo.subdomain];
            if (zone) {
              new DnsARecord(scope, `azure-a-rec-${index}`, {
                provider: azureProvider,
                name: extractHostName(appGw.dnsInfo.fqdn, zone.name),
                resourceGroupName: zone.resourceGroupName,
                zoneName: zone.name,
                ttl: 300,
                targetResourceId: appGw.publicIp.id,
              });
            }
          });
        }
      }
    }
  }

}
