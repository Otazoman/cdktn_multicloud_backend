import { ContainerAppJob } from "@cdktn/provider-azurerm/lib/container-app-job";
import { DataAzurermContainerApp } from "@cdktn/provider-azurerm/lib/data-azurerm-container-app";
import { DnsARecord } from "@cdktn/provider-azurerm/lib/dns-a-record";
import { RoleAssignment } from "@cdktn/provider-azurerm/lib/role-assignment";

import {
  azureAcaConfigs,
  azureAcaEnvironmentDefaults,
  azureAcaEnvironmentSettings,
  azureAppGwConfigs,
} from "../../config/azure/azuresettings";
import { apiContainerConfig } from "../../config/apicontainer";
import { isFeatureEnabled } from "../../config/features";
import {
  API_LIVENESS_PATH,
  API_READINESS_PATH,
  apiContainerSettings,
  apiLocalDbHost,
  JOURNAL_PRUNE_COMMAND,
  journalPruneEnvironment,
} from "../apicontainer";
import { createAzureContainerAppResources } from "../../constructs/container/azureaca";
import {
  createAzureAcaPrivateDnsResources,
} from "../../constructs/dns/privatezone/azureprivatezone";
import { createAzureAppGwResources } from "../../constructs/loadbalancer/azureappgw";
import { AzureAppGwResourcesWithDns } from "./types";
import { LoadBalancerDnsInfo } from "../common";
import { resourceName, idPart } from "../../utils/naming";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { AzureBuildContext } from "./context";
import { azureCicdDeployTarget } from "./cicd";
import { createAzureIdentityWithRoles } from "../../constructs/iam/azureidentity";
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

          // Deploy target of the Azure pipeline: CI/CD updates the image,
          // which the app pulls from the ACR with an AcrPull-only identity.
          let registry: { server: string; identityId: string } | undefined;
          let pullRoles: RoleAssignment[] = [];
          const cicdTarget = azureCicdDeployTarget();
          const isCicdTarget = cicdTarget?.containerAppName === config.name;
          if (cicdTarget && isCicdTarget) {
            const acr = acrRegistryMap.get(cicdTarget.acrName);
            if (!acr) {
              throw new Error(
                `Container App "${config.name}" (CI/CD deploy target): ACR "${cicdTarget.acrName}" ` +
                  `not found (or build: false) in config/azure/devops_acr_config.ts`,
              );
            }
            const pull = createAzureIdentityWithRoles(scope, azureProvider, {
              name: cicdTarget.pullIdentityName,
              resourceGroupName: config.resourceGroupName,
              location: config.location,
              grants: [{ key: "acr-pull", role: "AcrPull", scope: acr.id }],
            });
            registry = { server: acr.loginServer, identityId: pull.identity.id };
            pullRoles = pull.roleAssignments;
          }

          // The API (config/apicontainer.ts): the app CI/CD deploys to, when
          // Azure has a database. The password comes from the Key Vault
          // secret, which is set from the Azure VM: referenced only once
          // azureSecretReady (a missing secret stops the revision).
          const api = isCicdTarget
            ? apiContainerSettings("azure", () =>
                apiLocalDbHost(
                  "azure",
                  (output.dbResources ?? [])
                    .filter((d) => d.type === "postgresql")
                    .map((d) => ({ name: d.cnameRecordName ?? d.fqdn, host: d.fqdn })),
                ),
              )
            : undefined;
          let keyVaultSecrets:
            | { name: string; keyVaultSecretId: string; identityId: string }[]
            | undefined;
          let secretEnv: { name: string; secretName: string }[] | undefined;
          let secretRoles: RoleAssignment[] = [];
          if (api && apiContainerConfig.azureSecretReady) {
            if (!ctx.keyVault) {
              throw new Error(
                `Container App "${config.name}" (API): the Key Vault (dbs feature) is required ` +
                  `by apiContainerConfig.azureSecretReady`,
              );
            }
            const secretName = apiContainerConfig.passwordSecretKey;
            const reader = createAzureIdentityWithRoles(scope, azureProvider, {
              name: resourceName(undefined, "azure", "identity", `${config.name}-secrets`),
              resourceGroupName: config.resourceGroupName,
              location: config.location,
              grants: [
                {
                  key: "kv-secrets-user",
                  role: "Key Vault Secrets User",
                  scope: ctx.keyVault.id,
                },
              ],
            });
            keyVaultSecrets = [
              {
                name: secretName,
                keyVaultSecretId: `${ctx.keyVault.vaultUri}secrets/${secretName}`,
                identityId: reader.identity.id,
              },
            ];
            secretEnv = api.passwordVariables.map((name) => ({ name, secretName }));
            secretRoles = reader.roleAssignments;
          }
          const probes = api && apiContainerConfig.readinessProbe;

          const aca = createAzureContainerAppResources(
            scope,
            azureProvider,
            {
              ...config,
              env: api ? [...(config.env ?? []), ...api.environment] : config.env,
              keyVaultSecrets,
              secretEnv,
              readinessProbePath: probes ? API_READINESS_PATH : undefined,
              livenessProbePath: probes ? API_LIVENESS_PATH : undefined,
              ignoreImageChanges: isCicdTarget,
              registry,
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
          // The pull role must exist before the app pulls from the ACR
          pullRoles.forEach((role) => addTerraformDependency(aca.app, role));
          // ... and the Key Vault role before it reads the secret
          secretRoles.forEach((role) => addTerraformDependency(aca.app, role));

          // Journal pruning job (config/apicontainer.ts journalPrune): the
          // API's image (read from the deployed app; CI/CD updates the job
          // afterwards), settings, registry and secret, in the same
          // environment (VNet).
          if (api && apiContainerConfig.journalPrune.enabled) {
            if (!keyVaultSecrets || !secretEnv) {
              throw new Error(
                `Container App "${config.name}": the journal pruning job needs the database password ` +
                  `(apiContainerConfig.azureSecretReady)`,
              );
            }
            const prune = apiContainerConfig.journalPrune;
            const deployed = new DataAzurermContainerApp(
              scope,
              `journal-prune-api-image-${idPart(config.name)}`,
              {
                provider: azureProvider,
                name: aca.app.name,
                resourceGroupName: config.resourceGroupName,
                dependsOn: [aca.app],
              },
            );
            const identityIds = [
              ...new Set([
                ...(registry ? [registry.identityId] : []),
                ...keyVaultSecrets.map((s) => s.identityId),
              ]),
            ];
            const job = new ContainerAppJob(scope, `journal-prune-${idPart(config.name)}`, {
              provider: azureProvider,
              name: resourceName(prune.names.azure, "azure", "journal-prune"),
              location: config.location,
              resourceGroupName: config.resourceGroupName,
              containerAppEnvironmentId: aca.environment.id,
              replicaTimeoutInSeconds: 1800,
              replicaRetryLimit: 1,
              scheduleTriggerConfig: {
                cronExpression: prune.schedules.azure,
                parallelism: 1,
                replicaCompletionCount: 1,
              },
              identity: { type: "UserAssigned", identityIds },
              registry: registry
                ? [{ server: registry.server, identity: registry.identityId }]
                : undefined,
              secret: keyVaultSecrets.map((s) => ({
                name: s.name,
                keyVaultSecretId: s.keyVaultSecretId,
                identity: s.identityId,
              })),
              template: {
                container: [
                  {
                    name: "journal-prune",
                    image: deployed.template.get(0).container.get(0).image,
                    command: JOURNAL_PRUNE_COMMAND,
                    cpu: 0.25,
                    memory: "0.5Gi",
                    env: [
                      ...(api.environment ?? []),
                      ...journalPruneEnvironment(),
                      ...secretEnv,
                    ],
                  },
                ],
              },
            });
            job.addOverride("lifecycle", {
              ignore_changes: ["template[0].container[0].image"],
            });
            pullRoles.forEach((role) => addTerraformDependency(job, role));
            secretRoles.forEach((role) => addTerraformDependency(job, role));
            ctx.journalPruneJobs.set(config.name, job);
          }

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
        ctx.appGwsByName = Object.fromEntries(
          azureAppGwConfigs.filter((c) => c.build).map((c, i) => [c.name, azureAppGws[i]]),
        );

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

          azureAppGws.forEach((appGw) => {
            const zone = publicZones[appGw.dnsInfo.subdomain];
            if (zone) {
              new DnsARecord(scope, `azure-a-rec-${idPart(appGw.dnsInfo.fqdn || appGw.dnsInfo.subdomain)}`, {
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
