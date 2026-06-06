/**
 * azureResources.ts
 *
 * Single-cloud orchestrator for ALL Azure resources.
 *
 * Resource creation order (all Construct references available within one file):
 *
 *   1. VNet / Subnets / NSGs / NAT
 *   2. Public DNS Zone  (useDns)
 *   3. Azure Files      (useStorage)
 *   4. Azure Database   (useDbs)
 *   5. Azure VM         (useVms)
 *   6. AppGW + ACA      (useContainers)
 *   7. DNS A-records    (useDns + useContainers)
 */

import { DnsARecord } from "@cdktn/provider-azurerm/lib/dns-a-record";
import { DnsZone } from "@cdktn/provider-azurerm/lib/dns-zone";
import { PrivateDnsZone } from "@cdktn/provider-azurerm/lib/private-dns-zone";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { TerraformOutput } from "cdktn";
import { Construct } from "constructs";

import {
  azureAcaConfigs,
  azureAppGwConfigs,
  azureDatabaseConfig,
  azureFilesConfigs,
  azureVmsConfigparams,
  azureVnetResourcesparams,
} from "../config/azure/azuresettings";
import {
  awsToAzure,
  googleToAzure,
  useContainers,
  useDbs,
  useDns,
  useStorage,
  useVms,
} from "../config/commonsettings";
import { createAzureContainerAppResources } from "../constructs/container/azureaca";
import {
  createAzureAcaPrivateDnsResources,
  createSharedPrivateDnsZones,
} from "../constructs/dns/privatezone/azureprivatezone";
import { createAzureAppGwResources } from "../constructs/loadbarancer/azureappgw";
import { createAzureDatabases } from "../constructs/relationaldatabase/azuredatabase";
import {
  AzureFilesOutput,
  createAzureFilesResources,
} from "../constructs/storage/azurefiles";
import { createAzureVms } from "../constructs/vmresources/azurevm";
import { createAzureVnetResources } from "../constructs/vpcnetwork/azurevnet";
import {
  AzureAppGwResourcesWithDns,
  AzureResourcesOutput,
  AzureVnetResources,
  LoadBalancerDnsInfo,
} from "./interfaces";

/**
 * Creates all Azure resources in the correct dependency order.
 *
 * Conditions for each sub-section are evaluated from commonsettings.ts –
 * the config itself is never changed.
 */
export const createAzureResources = (
  scope: Construct,
  azureProvider: AzurermProvider,
): AzureResourcesOutput => {
  const output: AzureResourcesOutput = {};

  // ──────────────────────────────────────────────
  // 1. VNet
  // ──────────────────────────────────────────────
  if (!azureVnetResourcesparams.isEnabled) {
    return output;
  }

  const vnetRaw = createAzureVnetResources(
    scope,
    azureProvider,
    azureVnetResourcesparams,
  );

  const azureVnetResources: AzureVnetResources = {
    vnet: vnetRaw.vnet,
    nsgs: vnetRaw.nsgs,
    nsgRules: vnetRaw.nsgRules,
    subnets: vnetRaw.subnets,
    subnetAssociations: vnetRaw.subnetAssociations,
    params: vnetRaw.params,
  };

  output.vpc = azureVnetResources;

  // ──────────────────────────────────────────────
  // 2. Public DNS Zone
  // ──────────────────────────────────────────────
  const publicZones: Record<string, DnsZone> = {};

  if (useDns && azureAppGwConfigs) {
    const unique = (arr: (string | undefined)[]) =>
      Array.from(new Set(arr.filter(Boolean))) as string[];

    const azureSubdomains = unique(
      azureAppGwConfigs
        .filter((c) => c.build)
        .map((c) => (c as any).dnsConfig?.subdomain),
    );

    azureSubdomains.forEach((subdomain) => {
      const zoneSafeName = subdomain.replace(/\./g, "-");
      const zone = new DnsZone(scope, `p-zone-azure-${zoneSafeName}`, {
        provider: azureProvider,
        name: subdomain,
        resourceGroupName: azureAppGwConfigs[0].resourceGroupName,
      });
      publicZones[subdomain] = zone;
      new TerraformOutput(scope, `azure-ns-${zoneSafeName}`, {
        value: zone.nameServers,
      });
    });
  }

  // ──────────────────────────────────────────────
  // 3. Azure Files
  // ──────────────────────────────────────────────
  if (useStorage && (awsToAzure || googleToAzure)) {
    const buildableAzureFilesConfigs = azureFilesConfigs.filter((c) => c.build);

    let sharedFilesPrivateDnsZone: PrivateDnsZone | undefined = undefined;
    const azureFilesOutputs: AzureFilesOutput[] = [];

    buildableAzureFilesConfigs.forEach((config) => {
      let azureRes: AzureFilesOutput;

      if (config.privateEndpointEnabled && config.subnetKey) {
        const subnetResource = (
          azureVnetResources.subnets as Record<string, any>
        )[config.subnetKey];
        const subnetId: string = subnetResource?.id ?? subnetResource ?? "";
        const virtualNetworkId: string =
          (azureVnetResources.vnet as any).id ?? "";

        azureRes = createAzureFilesResources(scope, azureProvider, config, {
          subnetId,
          virtualNetworkId,
          sharedPrivateDnsZone: sharedFilesPrivateDnsZone,
        });

        if (!sharedFilesPrivateDnsZone && azureRes.privateDnsZone) {
          sharedFilesPrivateDnsZone = azureRes.privateDnsZone;
        }
      } else {
        azureRes = createAzureFilesResources(scope, azureProvider, config);
      }

      azureFilesOutputs.push(azureRes);
    });

    output.filesInstances = buildableAzureFilesConfigs
      .map((cfg, idx) => {
        if (!cfg.cnameRecordName) return null;
        const storageAccount = azureFilesOutputs[idx]?.storageAccount;
        if (!storageAccount) return null;
        const fqdn = cfg.privateEndpointEnabled
          ? `${cfg.accountName}.privatelink.file.core.windows.net`
          : `${cfg.accountName}.file.core.windows.net`;
        return { cnameRecordName: cfg.cnameRecordName, fqdn };
      })
      .filter(
        (item): item is { cnameRecordName: string; fqdn: string } =>
          item !== null,
      );
  }

  // ──────────────────────────────────────────────
  // 4. Azure Database
  // ──────────────────────────────────────────────
  if (useDbs && (awsToAzure || googleToAzure)) {
    if (
      typeof azureVnetResources.vnet === "object" &&
      "name" in azureVnetResources.vnet &&
      !("id" in azureVnetResources.vnet)
    ) {
      console.warn(
        "Azure VNet is not properly initialized for database creation",
      );
    } else {
      const databaseTypes = new Set<"mysql" | "postgresql">(
        azureDatabaseConfig.databases
          .filter((config) => config.build)
          .map((config) => config.type),
      );

      const sharedDnsZones = createSharedPrivateDnsZones(
        scope,
        azureProvider,
        azureDatabaseConfig.resourceGroupName,
        azureVnetResources.vnet as any,
        databaseTypes,
      );

      const azureDatabases = createAzureDatabases(scope, azureProvider, {
        resourceGroupName: azureDatabaseConfig.resourceGroupName,
        location: azureDatabaseConfig.location,
        databaseConfigs: azureDatabaseConfig.databases.filter(
          (config) => config.build,
        ),
        virtualNetwork: azureVnetResources.vnet as any,
        subnets: azureVnetResources.subnets as any,
        sharedDnsZones,
      });

      azureDatabases.forEach((dbOutput: any) => {
        dbOutput.server.node.addDependency(azureVnetResources);
      });

      const buildableDbConfigs = azureDatabaseConfig.databases.filter(
        (config) => config.build,
      );

      output.dbResources = azureDatabases.map((dbOutput: any, idx: number) => ({
        server: dbOutput.server,
        database: dbOutput.database,
        privateDnsZone: dbOutput.privateDnsZone,
        fqdn: dbOutput.fqdn,
        cnameRecordName: buildableDbConfigs[idx]?.cnameRecordName,
      }));
    }
  }

  // ──────────────────────────────────────────────
  // 5. Azure VM
  // ──────────────────────────────────────────────
  if (useVms && (awsToAzure || googleToAzure)) {
    const azureVmParams = {
      vnetName: azureVnetResources.vnet.name,
      subnets: azureVnetResources.subnets,
      vmConfigs: azureVmsConfigparams,
    };
    const azureVms = createAzureVms(scope, azureProvider, azureVmParams);
    azureVms.forEach((vm) => vm.node.addDependency(azureVnetResources.subnets));
  }

  // ──────────────────────────────────────────────
  // 6. ACA + AppGW  (useContainers)
  // ──────────────────────────────────────────────
  if (useContainers && (awsToAzure || googleToAzure)) {
    if (!azureAcaConfigs) {
      // no container config – skip
    } else {
      // 6a. ACA
      const envMap = new Map<string, any>();
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

          const aca = createAzureContainerAppResources(
            scope,
            azureProvider,
            { ...config, infrastructureSubnetId: subnet?.id } as any,
            envMap,
          );

          if (aca.fqdn) {
            acaFqdnMap.set(config.name, aca.fqdn);
          }

          // Collect for Private DNS Zone (internal ACA)
          if ((config as any).internal === true && aca.environment) {
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
          if ((config as any).cnameRecordName && aca.fqdn) {
            acaInstancesMeta.push({
              cnameRecordName: (config as any).cnameRecordName,
              fqdn: aca.fqdn,
            });
          }
        });

      output.acaInstances = acaInstancesMeta;

      // Private DNS Zones for internal ACA environments
      const vnetId = (azureVnetResources.vnet as any).id;
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

            const backendsWithResolvedFqdns = config.backends.map((be: any) => {
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
            } as any);

            resources.appGw.node.addDependency(azureVnetResources.subnets);

            if (azureVnetResources.nsgs) {
              Object.values(azureVnetResources.nsgs).forEach((nsg) => {
                resources.appGw.node.addDependency(nsg);
              });
            }

            if (azureVnetResources.nsgRules) {
              Object.values(azureVnetResources.nsgRules)
                .flat()
                .forEach((rule) => {
                  resources.appGw.node.addDependency(rule);
                });
            }

            if (azureVnetResources.subnetAssociations) {
              azureVnetResources.subnetAssociations.forEach((association) => {
                resources.appGw.node.addDependency(association);
              });
            }

            azureAcaConfigs
              .filter((c) => c.build)
              .forEach((acaConfig) => {
                const env = envMap.get(acaConfig.environmentName);
                if (env) {
                  resources.appGw.node.addDependency(env);
                }
              });

            const dnsInfo: LoadBalancerDnsInfo = {
              subdomain: (config as any).dnsConfig?.subdomain || "",
              fqdn: (config as any).dnsConfig?.fqdn,
            };

            return { ...resources, dnsInfo };
          });

        output.lbs = azureAppGws;

        // ──────────────────────────────────────────────
        // 7. DNS A-records
        // ──────────────────────────────────────────────
        if (useDns) {
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

  return output;
};
