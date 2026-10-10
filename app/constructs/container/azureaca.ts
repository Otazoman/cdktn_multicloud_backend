import { ContainerApp } from "@cdktn/provider-azurerm/lib/container-app";
import { ContainerAppEnvironment } from "@cdktn/provider-azurerm/lib/container-app-environment";
import { MonitorDiagnosticSetting } from "@cdktn/provider-azurerm/lib/monitor-diagnostic-setting";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Construct } from "constructs";

/**
 * Azure Container App Configuration
 */
export interface AzureContainerAppConfig {
  /** Construct ID key of the environment. Defaults to `environmentName` */
  environmentKey?: string;
  /**
   * Construct ID key (Terraform address). Defaults to `name`. To rename
   * the resource without replacing it in state, set this to the old value.
   */
  key?: string;
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
  /**
   * Scale rules (KEDA). Without rules Container Apps scales on HTTP traffic
   * (10 concurrent requests per replica). CPU / memory rules cannot scale to
   * zero replicas.
   */
  scaleRules?: AzureContainerAppScaleRule[];
  /**
   * Environment logs (applied when the environment is created): when set,
   * the environment sends its logs to Azure Monitor and a diagnostic setting
   * forwards them to the Log Analytics Workspace (resource-specific tables
   * ContainerAppConsoleLogs / ContainerAppSystemLogs).
   */
  environmentLogs?: {
    logAnalyticsWorkspaceId: string;
    diagnosticSettingName: string;
    /** Also archive the logs to this storage account */
    archiveStorageAccountId?: string;
  };
}

/** Container Apps scale rule. */
export type AzureContainerAppScaleRule =
  | { type: "http" | "tcp"; name: string; concurrentRequests: number }
  | { type: "cpu" | "memory"; name: string; utilization: number };

export function createAzureContainerAppResources(
  scope: Construct,
  provider: AzurermProvider,
  config: AzureContainerAppConfig & { infrastructureSubnetId?: string },
  envMap: Map<string, ContainerAppEnvironment>, // 追加
) {
  // 1. Retrieve or Create a Container App Environment
  let environment = envMap.get(config.environmentName);

  if (!environment) {
    // Create the resource only if `environmentName` appears for the first time
    environment = new ContainerAppEnvironment(
      scope,
      `aca-env-${config.environmentKey ?? config.environmentName}`,
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
        ...(config.environmentLogs ? { logsDestination: "azure-monitor" } : {}),
      },
    );
    envMap.set(config.environmentName, environment);

    if (config.environmentLogs) {
      new MonitorDiagnosticSetting(
        scope,
        `aca-env-diagnostic-setting-${config.environmentKey ?? config.environmentName}`,
        {
          provider,
          name: config.environmentLogs.diagnosticSettingName,
          targetResourceId: environment.id,
          logAnalyticsWorkspaceId: config.environmentLogs.logAnalyticsWorkspaceId,
          storageAccountId: config.environmentLogs.archiveStorageAccountId,
          logAnalyticsDestinationType: "Dedicated",
          enabledLog: [
            { category: "ContainerAppConsoleLogs" },
            { category: "ContainerAppSystemLogs" },
          ],
        },
      );
    }
  }

  // 2. Container App (This must be created for each service)
  const app = new ContainerApp(scope, `aca-app-${config.key ?? config.name}`, {
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
      ...scaleRuleBlocks(config.scaleRules),
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

function scaleRuleBlocks(rules: AzureContainerAppScaleRule[] | undefined) {
  if (!rules || rules.length === 0) {
    return {};
  }
  const requestRules = (type: "http" | "tcp") =>
    rules.flatMap((rule) =>
      rule.type === type
        ? [{ name: rule.name, concurrentRequests: String(rule.concurrentRequests) }]
        : [],
    );
  const http = requestRules("http");
  const tcp = requestRules("tcp");
  const custom = rules.flatMap((rule) =>
    rule.type === "cpu" || rule.type === "memory"
      ? [
          {
            name: rule.name,
            customRuleType: rule.type,
            metadata: { type: "Utilization", value: String(rule.utilization) },
          },
        ]
      : [],
  );
  return {
    ...(http.length > 0 ? { httpScaleRule: http } : {}),
    ...(tcp.length > 0 ? { tcpScaleRule: tcp } : {}),
    ...(custom.length > 0 ? { customScaleRule: custom } : {}),
  };
}
