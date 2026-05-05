import { ContainerApp } from "@cdktn/provider-azurerm/lib/container-app";
import { ContainerAppEnvironment } from "@cdktn/provider-azurerm/lib/container-app-environment";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Construct } from "constructs";

/**
 * Azure Container App Configuration
 */
export interface AzureContainerAppConfig {
  name: string;
  build: boolean;
  resourceGroupName: string;
  location: string;
  environmentName: string;
  image: string;
  cpu: number;
  memory: string;
  targetPort: number;
  internal: boolean;
  externalEnabled: boolean;
  subnetName: string;
  env?: { name: string; value: string }[];
  minReplicas?: number;
  maxReplicas?: number;
}

export function createAzureContainerAppResources(
  scope: Construct,
  provider: AzurermProvider,
  config: AzureContainerAppConfig & { infrastructureSubnetId: string },
  envMap: Map<string, ContainerAppEnvironment>, // 追加
) {
  // 1. Retrieve or Create a Container App Environment
  let environment = envMap.get(config.environmentName);

  if (!environment) {
    // Create the resource only if `environmentName` appears for the first time
    environment = new ContainerAppEnvironment(
      scope,
      `aca-env-${config.environmentName}`,
      {
        provider,
        name: config.environmentName,
        location: config.location,
        resourceGroupName: config.resourceGroupName,
        // Due to Azure provider constraints, `infrastructure_subnet_id` and `internal_load_balancer_enabled`
        // must be specified together.
        // In public environments where `subnetName` is empty, omit both.
        ...(config.infrastructureSubnetId
          ? {
              infrastructureSubnetId: config.infrastructureSubnetId,
              internalLoadBalancerEnabled: config.internal,
            }
          : {}),
      },
    );
    envMap.set(config.environmentName, environment);
  }

  // 2. Container App (This must be created for each service)
  const app = new ContainerApp(scope, `aca-app-${config.name}`, {
    provider,
    name: config.name,
    resourceGroupName: config.resourceGroupName,
    containerAppEnvironmentId: environment.id,
    revisionMode: "Single",

    template: {
      container: [
        {
          name: config.name,
          image: config.image,
          cpu: config.cpu,
          memory: config.memory,
          env: config.env,
        },
      ],
      minReplicas: config.minReplicas ?? 0,
      maxReplicas: config.maxReplicas ?? 10,
    },

    ingress: {
      // Even in Internal mode, “true” is required to allow access from within the VNET (AppGW)
      externalEnabled: config.externalEnabled,
      targetPort: config.targetPort,
      allowInsecureConnections: true,
      trafficWeight: [{ percentage: 100, latestRevision: true }],
    },
  });

  // Use `<app.name>.<environment.defaultDomain>` as the stable ingressFqdn.
  // This is consistent regardless of revision updates.
  return {
    environment,
    app,
    fqdn: `${app.name}.${environment.defaultDomain}`,
  };
}
