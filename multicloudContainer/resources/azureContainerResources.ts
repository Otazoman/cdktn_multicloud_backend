import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Construct } from "constructs";
import { azureAppGwConfigs } from "../config/azure/applicationgateway";
import { azureAcaConfigs } from "../config/azure/azuresettings";
import { createAzureContainerAppResources } from "../constructs/container/azureaca";
import { createAzureAcaPrivateDnsResources } from "../constructs/dns/privatezone/azureprivatezone";
import { createAzureAppGwResources } from "../constructs/loadbarancer/azureappgw";
import {
  AzureAppGwResourcesWithDns,
  AzureVnetResources,
  LoadBalancerDnsInfo,
} from "./interfaces";

export interface AzureContainerResourcesOutput {
  azureAppGws?: AzureAppGwResourcesWithDns[];
}

/**
 * Creates Azure Container Apps (ACA) first, then injects their ingressFqdn
 * into the Application Gateway backend pools by matching the ACA app name
 * to the targetFqdns entries in the backend config.
 *
 * Execution order (self-contained):
 *   1. ACA (ContainerAppEnvironment + ContainerApp)
 *   2. Application Gateway (with ACA ingressFqdn injected into backend pools)
 */
export const createAzureContainerResources = (
  scope: Construct,
  azureProvider: AzurermProvider,
  azureVnetResources: AzureVnetResources,
): AzureContainerResourcesOutput => {
  if (!azureAcaConfigs || !azureVnetResources) {
    return {};
  }

  // --- Step 1: Create ACA resources and build a serviceName → ingressFqdn map ---
  const envMap = new Map<string, any>();
  // Key: ACA app name (e.g. "backend-api-service"), Value: ingressFqdn token
  const acaFqdnMap = new Map<string, string>();
  // Track which environments have internal LB enabled and need Private DNS
  // Key: environmentName, Value: { defaultDomain, staticIpAddress, apps }
  const internalEnvDnsMap = new Map<
    string,
    { defaultDomain: string; staticIpAddress: string; apps: string[] }
  >();

  azureAcaConfigs
    .filter((c) => c.build)
    .forEach((config) => {
      const subnet = config.subnetName
        ? azureVnetResources.subnets[config.subnetName]
        : undefined;

      const aca = createAzureContainerAppResources(
        scope,
        azureProvider,
        {
          ...config,
          infrastructureSubnetId: subnet?.id,
        } as any,
        envMap,
      );

      if (aca.fqdn) {
        acaFqdnMap.set(config.name, aca.fqdn);
      }

      // Collect internal ACA environments for Private DNS Zone registration.
      // internal: true means the ACA Environment uses an Internal Load Balancer,
      // so DNS must resolve to the private IP within the VNet.
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
    });

  // --- Step 1b: Register Private DNS Zones for internal ACA environments ---
  // This allows resources within the VNet (e.g. AppGW) to resolve ACA FQDNs
  // to private IP addresses instead of public ones.
  const vnetId = (azureVnetResources.vnet as any).id;
  internalEnvDnsMap.forEach((envDns, envName) => {
    // Use the first ACA config in this env to get the resourceGroupName
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

  // --- Step 2: Create Application Gateway with ACA ingressFqdn injected ---
  if (!azureAppGwConfigs) {
    return {};
  }

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

      // Dependency: AppGW must be deleted before NSG Rules can be removed
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

  return { azureAppGws };
};
