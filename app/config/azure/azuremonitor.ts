import type {
  AzureLogAlertDefinition,
  AzureMetricAlertDefinition,
} from "../../constructs/observability/azuremonitor";
import { LOCATION, RESOURCE_GROUP } from "./common";
import { alertEmails } from "../notifications";

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
  // Tables that exist in every workspace: set at every deploy. Container Apps
  // environments use the resource-specific ContainerApp* tables.
  tableRetention: {
    ContainerAppConsoleLogs: 30,
    ContainerAppSystemLogs: 30,
  } as Record<string, number>,
  // Tables that Azure creates only when the first log arrives; their retention
  // cannot be set before. VPN gateway logs only go to the shared
  // AzureDiagnostics table (every resource sending in "Azure diagnostics" mode
  // uses it). Set only when the Azure VPN gateway is built with logs
  // (azureVpnparams.logs) and the build stage is 3 (config/buildstage.ts);
  // until then the table uses the workspace retention.
  deferredTableRetention: {
    AzureDiagnostics: 30,
  } as Record<string, number>,
  applicationInsightsName: "app-insights-prod",
  // Notification targets. Created only when `clouds.azure.features.alerting`
  // is enabled; alerts reference them by `key` (azureAlertingConfig.*.notify).
  actionGroups: [
    {
      key: "ops",
      name: "ag-ops-alerts",
      shortName: "ops",
      emailReceivers: alertEmails.map((emailAddress, i) => ({
        name: `ops-${i + 1}`,
        emailAddress,
        useCommonAlertSchema: true,
      })),
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
  /**
   * Resolved to its ID. An Application Gateway alert is created only when
   * that gateway is built (HTTP and HTTPS gateways are alternatives).
   */
  target?: { type: "containerApp" | "applicationGateway"; name: string };
  scopes?: string[];
  /** azureMonitorConfig.actionGroups keys */
  notify?: string[];
  /** false: the alert is not created. Default: true */
  enabled?: boolean;
};

/**
 * Uptime check of the API from the internet: an Application Insights
 * resource (azureMonitorConfig.applicationInsightsName, on the Log Analytics
 * Workspace) and one standard web test of /readyz per built Application
 * Gateway (its FQDN with the dns feature, else its public IP), with an
 * alert. Created from build stage 3 (config/buildstage.ts): before, the
 * placeholder image does not answer /readyz.
 */
export interface AzureUptimeCheckConfig {
  /** false: no availability tests. Default: true */
  enabled: boolean;
  /** Seconds between tests: 300, 600 or 900 */
  frequency: number;
  /** Seconds */
  timeout: number;
  /**
   * Number of test locations: the first locationCount entries of
   * geoLocations. Microsoft recommends at least five ("Our minimum number of
   * recommended test locations is five", Azure Monitor availability tests).
   */
  locationCount: number;
  /**
   * Candidate test locations in order of preference (population tags of the
   * "Location population tags" table:
   * https://learn.microsoft.com/azure/azure-monitor/app/availability-standard-tests)
   */
  geoLocations: string[];
  /**
   * The alert fires when at least this many locations fail (1 to
   * locationCount). Microsoft recommends locationCount - 2, e.g. 3 of 5.
   */
  failedLocationCount: number;
  /** azureMonitorConfig.actionGroups keys */
  notify: string[];
}

/**
 * Alerts (created only when `clouds.azure.features.alerting` is enabled in
 * commonsettings.ts). Notification targets are azureMonitorConfig.actionGroups.
 */
export const azureAlertingConfig: {
  logAlerts: AzureLogAlertConfig[];
  metricAlerts: AzureMetricAlertConfig[];
  uptimeCheck: AzureUptimeCheckConfig;
} = {
  uptimeCheck: {
    enabled: true,
    frequency: 300,
    timeout: 30,
    // The first 3 candidates. Microsoft's recommendation: locationCount 5,
    // failedLocationCount 3
    locationCount: 3,
    failedLocationCount: 2,
    geoLocations: [
      "apac-jp-kaw-edge", // Japan East
      "apac-hk-hkn-azr", // East Asia
      "apac-sg-sin-azr", // Southeast Asia
      "emea-au-syd-edge", // Australia East
      "us-ca-sjc-azr", // West US
      "us-va-ash-azr", // East US
      "us-il-ch1-azr", // North Central US
      "us-tx-sn1-azr", // South Central US
      "us-fl-mia-edge", // Central US
      "emea-nl-ams-azr", // West Europe
      "emea-gb-db3-azr", // North Europe
      "emea-fr-pra-edge", // France Central
      "emea-ru-msa-edge", // UK South
      "emea-se-sto-edge", // UK West
      "latam-br-gru-edge", // Brazil South
    ],
    notify: ["ops"],
  },
  logAlerts: [
    // Errors the API writes to its log (e.g. "Readiness check failed") and
    // failures of the journal pruning job (Container Apps job)
    ...[
      {
        name: "api-errors",
        query: 'ContainerAppConsoleLogs | where ContainerAppName == "backend-api-service" and Log has "failed"',
      },
      {
        name: "journal-prune-failed",
        query: 'ContainerAppConsoleLogs | where Log has "Journal pruning failed"',
      },
    ].map((a) => ({
      ...a,
      severity: 2,
      evaluationFrequency: "PT5M",
      windowDuration: "PT5M",
      timeAggregationMethod: "Count" as const,
      operator: "GreaterThan" as const,
      threshold: 0,
      notify: ["ops"],
    })),
  ],
  metricAlerts: [
    // 5xx of the API's Application Gateway. One per gateway; only the built
    // one gets it.
    ...["plain-http-appgw", "plain-https-appgw"].map((name) => ({
      name: `${name}-5xx`,
      target: { type: "applicationGateway" as const, name },
      metricNamespace: "Microsoft.Network/applicationGateways",
      metricName: "ResponseStatus",
      aggregation: "Total" as const,
      dimensions: [{ name: "HttpStatusGroup", operator: "Include" as const, values: ["5xx"] }],
      operator: "GreaterThanOrEqual" as const,
      threshold: 10,
      frequency: "PT5M",
      windowSize: "PT5M",
      notify: ["ops"],
    })),
    // No healthy API behind the Application Gateway: unhealthy backend hosts
    // over 5 minutes. One per gateway; only the built one gets it.
    ...["plain-http-appgw", "plain-https-appgw"].map((name) => ({
      enabled: true,
      name: `${name}-unhealthy-hosts`,
      target: { type: "applicationGateway" as const, name },
      metricNamespace: "Microsoft.Network/applicationGateways",
      metricName: "UnhealthyHostCount",
      aggregation: "Average" as const,
      operator: "GreaterThan" as const,
      threshold: 0,
      frequency: "PT1M",
      windowSize: "PT5M",
      notify: ["ops"],
    })),
    // Response time (whole request at the gateway, ms): average over 5
    // minutes above 1 second (the metric has no percentiles). One per
    // gateway; only the built one gets it.
    ...["plain-http-appgw", "plain-https-appgw"].map((name) => ({
      enabled: true,
      name: `${name}-latency`,
      target: { type: "applicationGateway" as const, name },
      metricNamespace: "Microsoft.Network/applicationGateways",
      metricName: "ApplicationGatewayTotalTime",
      aggregation: "Average" as const,
      operator: "GreaterThan" as const,
      threshold: 1000,
      frequency: "PT5M",
      windowSize: "PT5M",
      notify: ["ops"],
    })),
  ],
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
    lifecycle?: {
      toCoolDays?: number;
      toArchiveDays?: number;
      deleteDays?: number;
    };
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
