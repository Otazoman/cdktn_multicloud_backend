import { ContainerApp } from "@cdktn/provider-azurerm/lib/container-app";
import { ContainerAppEnvironment } from "@cdktn/provider-azurerm/lib/container-app-environment";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Construct } from "constructs";

/**
 * Azure Container App Configuration
 */
export interface AzureContainerAppConfig {
  name: string;
  location: string;
  resourceGroupName: string;
  environmentName: string;
  container: {
    name: string;
    image: string;
    cpu: number;
    memory: string;
    env?: { name: string; value: string }[];
  };
  targetPort: number;
  externalEnabled: boolean;
  minReplicas?: number;
  maxReplicas?: number;
  tags?: { [key: string]: string };
}

export function createAzureContainerAppResources(
  scope: Construct,
  provider: AzurermProvider,
  config: AzureContainerAppConfig,
) {
  // 1. Container App Environment
  const environment = new ContainerAppEnvironment(
    scope,
    `aca-env-${config.name}`,
    {
      provider,
      name: config.environmentName,
      location: config.location,
      resourceGroupName: config.resourceGroupName,
      tags: config.tags,
    },
  );

  // 2. Container App
  const app = new ContainerApp(scope, `aca-app-${config.name}`, {
    provider,
    name: config.name,
    resourceGroupName: config.resourceGroupName,
    containerAppEnvironmentId: environment.id,
    revisionMode: "Single",

    template: {
      container: [
        {
          name: config.container.name,
          image: config.container.image,
          cpu: config.container.cpu,
          memory: config.container.memory,
          env: config.container.env,
        },
      ],
      minReplicas: config.minReplicas ?? 0,
      maxReplicas: config.maxReplicas ?? 10,
    },

    ingress: {
      externalEnabled: config.externalEnabled,
      targetPort: config.targetPort,
      allowInsecureConnections: false,
      trafficWeight: [
        {
          percentage: 100,
          latestRevision: true,
        },
      ],
    },

    tags: config.tags,
  });

  return { environment, app };
}
