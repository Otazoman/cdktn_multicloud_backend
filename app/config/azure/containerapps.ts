import { LOCATION, RESOURCE_GROUP } from "./common";

/** Container Apps environment settings. */
export interface AzureAcaEnvironmentSettings {
  /**
   * Send the environment logs to the Log Analytics Workspace
   * (azuremonitor.ts) through a diagnostic setting. Retention is set per
   * table in azureMonitorConfig.tableRetention.
   */
  logs?: boolean;
  /** Default: <PROJECT_NAME>-azure-aca-env-diagnostic-setting-<environmentName> */
  diagnosticSettingName?: string;
}

/** Applied to every Container Apps environment unless overridden below. */
export const azureAcaEnvironmentDefaults: AzureAcaEnvironmentSettings = {
  logs: true,
};

/** Per-environment overrides, keyed by environmentName (optional). */
export const azureAcaEnvironmentSettings: Record<
  string,
  AzureAcaEnvironmentSettings
> = {
  // "some-env": { logs: false },
};

/**
 * Container Apps.
 *
 * Scaling: minReplicas / maxReplicas and optional scaleRules, e.g.
 *   scaleRules: [
 *     { type: "http", name: "http-scale", concurrentRequests: 50 },
 *     { type: "cpu", name: "cpu-scale", utilization: 70 },     // %
 *     { type: "memory", name: "mem-scale", utilization: 80 },  // %
 *   ] satisfies AzureContainerAppScaleRule[],
 * (import type { AzureContainerAppScaleRule } from
 * "../../constructs/container/azureaca"; `satisfies` keeps the rule types)
 * Without scaleRules Container Apps scales on HTTP traffic (10 concurrent
 * requests per replica). CPU / memory rules cannot scale to zero replicas.
 */
export const azureAcaConfigs = [
  {
    name: "frontend-service",
    build: false,
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    environmentName: "public-main-env",
    // Private DNS zone VNet link name (internal environments)
    privateDnsVnetLinkName: "aca-vnet-link",
    image: "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest",
    cpu: 0.25,
    memory: "0.5Gi",
    targetPort: 80,
    internal: false,
    externalEnabled: true,
    subnetName: "",
    env: [{ name: "APP_MODE", value: "prod" }],
    minReplicas: 0,
    maxReplicas: 10,
  },
  {
    name: "backend-api-service",
    build: true,
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    environmentName: "main-env",
    // Private DNS zone VNet link name (internal environments)
    privateDnsVnetLinkName: "aca-vnet-link",
    image: "nginx:latest",
    cpu: 0.25,
    memory: "0.5Gi",
    targetPort: 80,
    internal: true,
    externalEnabled: true,
    subnetName: "aca-subnet",
    env: [{ name: "DB_URL", value: "flexible-db.mysql.database.azure.com" }],
    minReplicas: 0,
    maxReplicas: 10,
    cnameRecordName: "api-backend",
    appGwBackendName: "http-backend-pool",
  },
];
