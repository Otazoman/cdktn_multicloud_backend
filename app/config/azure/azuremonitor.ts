import type {
  AzureLogAlertDefinition,
  AzureMetricAlertDefinition,
} from "../../constructs/observability/azuremonitor";
import { LOCATION, RESOURCE_GROUP } from "./common";

/**
 * Azure Monitor configuration for Log Analytics Workspace and Diagnostic Settings.
 * This serves as the central config for monitoring resources across all Azure services.
 */
export const azureMonitorConfig = {
  isEnabled: true,
  resourceGroupName: RESOURCE_GROUP,
  location: LOCATION,
  logAnalyticsWorkspace: {
    name: "log-workspace-prod",
    sku: "PerGB2018",
    retentionInDays: 30,
  },
  // Retention in days per table (default: logAnalyticsWorkspace.retentionInDays).
  // VPN gateway logs only go to the shared AzureDiagnostics table (every
  // resource sending in "Azure diagnostics" mode uses it). Container Apps
  // environments use the resource-specific ContainerApp* tables.
  tableRetention: {
    AzureDiagnostics: 30,
    ContainerAppConsoleLogs: 30,
    ContainerAppSystemLogs: 30,
  } as Record<string, number>,
  applicationInsightsName: "app-insights-prod",
  // Notification targets. Created only when `clouds.azure.features.alerting`
  // is enabled; alerts reference them by `key` (azureAlertingConfig.*.notify).
  actionGroups: [
    {
      key: "devops",
      name: "ag-devops-alerts",
      shortName: "devops",
      emailReceivers: [
        {
          name: "admin",
          emailAddress: "admin@example.com",
          useCommonAlertSchema: true,
        },
      ],
    },
  ],
  tags: {
    purpose: "monitoring-and-diagnostics",
    environment: "multicloud",
    managedBy: "cdktn",
  },
};

/** Log alert (v2 API). `scopes` defaults to the Log Analytics Workspace above. */
export type AzureLogAlertConfig = Omit<
  AzureLogAlertDefinition,
  "scopes" | "actionGroups"
> & {
  scopes?: string[];
  /** azureMonitorConfig.actionGroups keys */
  notify?: string[];
};

/** Metric alert. Set either `target` (resolved to its ID) or `scopes`. */
export type AzureMetricAlertConfig = Omit<
  AzureMetricAlertDefinition,
  "scopes" | "actionGroups"
> & {
  target?: { type: "containerApp"; name: string };
  scopes?: string[];
  /** azureMonitorConfig.actionGroups keys */
  notify?: string[];
};

/**
 * Alerts (created only when `clouds.azure.features.alerting` is enabled in
 * commonsettings.ts). Notification targets are azureMonitorConfig.actionGroups.
 *
 * Example:
 *   logAlerts: [{
 *     name: "aca-console-errors",
 *     query: 'ContainerAppConsoleLogs | where Log has "ERROR"',
 *     severity: 2,
 *     evaluationFrequency: "PT5M",
 *     windowDuration: "PT5M",
 *     timeAggregationMethod: "Count",
 *     operator: "GreaterThan",
 *     threshold: 0,
 *     notify: ["devops"],
 *   }],
 *   metricAlerts: [{
 *     name: "aca-backend-cpu-high",
 *     target: { type: "containerApp", name: "backend-api-service" },
 *     metricNamespace: "Microsoft.App/containerApps",
 *     metricName: "UsageNanoCores",
 *     aggregation: "Average",
 *     operator: "GreaterThan",
 *     threshold: 200000000,
 *     frequency: "PT5M",
 *     windowSize: "PT15M",
 *     notify: ["devops"],
 *   }],
 */
export const azureAlertingConfig: {
  logAlerts: AzureLogAlertConfig[];
  metricAlerts: AzureMetricAlertConfig[];
} = {
  logAlerts: [],
  metricAlerts: [],
};

/**
 * Log archive to a storage account (created only when
 * `clouds.azure.features.logArchive` is enabled in commonsettings.ts).
 *
 * The diagnostic settings of the Container Apps environments (containerapps.ts,
 * logs: true) also send the logs to the storage account (containers
 * "insights-logs-<category>", hourly blobs).
 *
 * deleteOnDestroy: true deletes the storage account and the archived logs on
 * destroy. false sets prevent_destroy, so destroy fails (remove the storage
 * account from the state before destroying to keep it).
 */
export const azureLogArchiveConfig: {
  deleteOnDestroy: boolean;
  storageAccount: {
    /** Required (3-24 lowercase letters and digits, globally unique) */
    name?: string;
    /** The archive tier needs LRS / GRS / RA-GRS (not ZRS) */
    replication: string;
    /**
     * Double encryption (infrastructure encryption) in addition to the
     * default encryption at rest. No extra charge. Can only be set when the
     * storage account is created: changing it replaces the account (and
     * deletes the archived logs).
     */
    infrastructureEncryption: boolean;
    lifecycle?: { toCoolDays?: number; toArchiveDays?: number; deleteDays?: number };
  };
  /** Environments (environmentName) to archive. Omitted: every environment with logs: true */
  acaEnvironments?: string[];
} = {
  deleteOnDestroy: true,
  storageAccount: {
    name: undefined,
    replication: "LRS",
    infrastructureEncryption: false,
    lifecycle: { toCoolDays: 30, toArchiveDays: 90, deleteDays: 365 },
  },
};
