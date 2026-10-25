import type { AzureContainerAppConfig } from "../../constructs/container/azureaca";
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
> = {};

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
export type AzureAcaSettings = Omit<
  AzureContainerAppConfig,
  "ignoreImageChanges" | "registry" | "environmentLogs" | "keyVaultSecrets" | "secretEnv"
> & {
  build: boolean;
  /** Private DNS zone VNet link name (internal environments) */
  privateDnsVnetLinkName?: string;
  /** CNAME of the app in the azure.inner private zone */
  cnameRecordName?: string;
  /** Application Gateway backend pool that routes to this app */
  appGwBackendName?: string;
  /**
   * Subnets (names in vnet/subnets.ts) allowed to reach the app's ingress,
   * e.g. only the Application Gateway; other sources are denied (the VNet
   * and the VPN-connected clouds included). Default: no restriction
   */
  allowedSourceSubnets?: string[];
};

export const azureAcaConfigs: AzureAcaSettings[] = [
  {
    name: "backend-api-service",
    build: true,
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    environmentName: "main-env",
    // Private DNS zone VNet link name (internal environments)
    privateDnsVnetLinkName: "aca-vnet-link",
    // Placeholder until CI/CD deploys the API (which listens on 8080);
    // this image also listens on 8080.
    image: "nginxinc/nginx-unprivileged:stable",
    cpu: 0.25,
    memory: "0.5Gi",
    targetPort: 8080,
    internal: true,
    externalEnabled: true,
    subnetName: "aca-subnet",
    minReplicas: 0,
    maxReplicas: 10,
    cnameRecordName: "api-backend",
    appGwBackendName: "http-backend-pool",
    // Only the Application Gateway reaches the API
    allowedSourceSubnets: ["web-appgw-subnet"],
  },
];
