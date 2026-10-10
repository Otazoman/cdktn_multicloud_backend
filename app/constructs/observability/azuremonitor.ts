import { LogAnalyticsWorkspace } from "@cdktn/provider-azurerm/lib/log-analytics-workspace";
import { LogAnalyticsWorkspaceTable } from "@cdktn/provider-azurerm/lib/log-analytics-workspace-table";
import { MonitorActionGroup } from "@cdktn/provider-azurerm/lib/monitor-action-group";
import { MonitorDiagnosticSetting } from "@cdktn/provider-azurerm/lib/monitor-diagnostic-setting";
import { MonitorMetricAlert } from "@cdktn/provider-azurerm/lib/monitor-metric-alert";
import { MonitorScheduledQueryRulesAlertV2 } from "@cdktn/provider-azurerm/lib/monitor-scheduled-query-rules-alert-v2";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Construct } from "constructs";
import { addTerraformDependency } from "../../utils/terraformDependency";

/**
 * Definition for Log Analytics Workspace.
 */
export interface AzureLogAnalyticsWorkspaceDefinition {
  name: string;
  retentionInDays: number;
  sku?: string;
}

/**
 * Definition for Diagnostic Settings.
 */
export interface AzureDiagnosticSettingDefinition {
  name: string;
  targetResourceId: string;
  enabledLogs?: string[];
  enabledMetrics?: string[];
}

/**
 * Definition for an Action Group.
 */
export interface AzureActionGroupDefinition {
  name: string;
  shortName: string;
  emailReceivers?: Array<{
    name: string;
    emailAddress: string;
    useCommonAlertSchema?: boolean;
  }>;
}

/**
 * Definition for a log alert (Scheduled Query Rules, v2 API).
 */
export interface AzureLogAlertDefinition {
  name: string;
  /** Resources the query runs against (e.g. a Log Analytics Workspace ID). */
  scopes: string[];
  /** KQL query (e.g. 'ContainerAppConsoleLogs | where Log has "ERROR"'). */
  query: string;
  /** Severity from 0 (critical) to 4 (verbose). */
  severity: number;
  /** How often the query runs, ISO 8601 (e.g. "PT5M"). */
  evaluationFrequency: string;
  /** Time range the query covers, ISO 8601 (e.g. "PT5M"). */
  windowDuration: string;
  timeAggregationMethod: "Average" | "Count" | "Maximum" | "Minimum" | "Total";
  operator:
    | "Equal"
    | "GreaterThan"
    | "GreaterThanOrEqual"
    | "LessThan"
    | "LessThanOrEqual";
  threshold: number;
  /** Column to aggregate (required unless timeAggregationMethod is "Count"). */
  metricMeasureColumn?: string;
  failingPeriods?: {
    minimumFailingPeriodsToTriggerAlert: number;
    numberOfEvaluationPeriods: number;
  };
  actionGroups?: string[];
  description?: string;
  enabled?: boolean;
}

/**
 * Definition for a metric alert.
 */
export interface AzureMetricAlertDefinition {
  name: string;
  scopes: string[];
  metricNamespace: string;
  metricName: string;
  aggregation: "Average" | "Minimum" | "Maximum" | "Total" | "Count";
  operator:
    | "GreaterThan"
    | "GreaterThanOrEqualTo"
    | "LessThan"
    | "LessThanOrEqualTo";
  threshold: number;
  frequency: string;
  windowSize: string;
  actionGroups?: string[];
  description?: string;
}

/**
 * Configuration for the AzureMonitorResources construct.
 */
export interface AzureMonitorResourcesConfig {
  resourceGroupName: string;
  location: string;
  logAnalyticsWorkspace?: AzureLogAnalyticsWorkspaceDefinition;
  /**
   * Retention in days per table of the workspace (e.g. { AzureDiagnostics: 30 }).
   * Tables not listed use the workspace retention. Removing an entry resets
   * the table to the workspace retention (the table itself is not deleted).
   */
  tableRetention?: Record<string, number>;
  diagnosticSettings?: AzureDiagnosticSettingDefinition[];
  actionGroups?: AzureActionGroupDefinition[];
  logAlerts?: AzureLogAlertDefinition[];
  metricAlerts?: AzureMetricAlertDefinition[];
  tags?: { [key: string]: string };
}

/**
 * Construct for creating Azure Monitor resources and Diagnostics.
 */
export class AzureMonitorResources extends Construct {
  public readonly logAnalyticsWorkspace?: LogAnalyticsWorkspace;
  public readonly createdDiagnosticSettings: Record<
    string,
    MonitorDiagnosticSetting
  > = {};
  public readonly createdActionGroups: Record<string, MonitorActionGroup> = {};
  public readonly createdLogAlerts: Record<
    string,
    MonitorScheduledQueryRulesAlertV2
  > = {};
  public readonly createdMetricAlerts: Record<string, MonitorMetricAlert> = {};

  constructor(
    scope: Construct,
    id: string,
    provider: AzurermProvider,
    config: AzureMonitorResourcesConfig,
  ) {
    super(scope, id);

    // 1. Create Log Analytics Workspace
    if (config.logAnalyticsWorkspace) {
      this.logAnalyticsWorkspace = new LogAnalyticsWorkspace(
        this,
        "azure_log_analytics_workspace",
        {
          provider: provider,
          name: config.logAnalyticsWorkspace.name,
          location: config.location,
          resourceGroupName: config.resourceGroupName,
          retentionInDays: config.logAnalyticsWorkspace.retentionInDays,
          sku: config.logAnalyticsWorkspace.sku ?? "PerGB2018",
          tags: config.tags,
        },
      );

      Object.entries(config.tableRetention ?? {}).forEach(
        ([tableName, retentionInDays]) => {
          new LogAnalyticsWorkspaceTable(this, `table-retention-${tableName}`, {
            provider: provider,
            workspaceId: this.logAnalyticsWorkspace!.id,
            name: tableName,
            retentionInDays,
          });
        },
      );
    }

    // 2. Create Diagnostic Settings
    if (config.diagnosticSettings && this.logAnalyticsWorkspace) {
      config.diagnosticSettings.forEach((diagDef, index) => {
        const sanitizedId = diagDef.name.replace(/[^a-zA-Z0-9]/g, "-");

        const enabledLogs = diagDef.enabledLogs ?? [
          "GatewayDiagnosticLog",
          "TunnelDiagnosticLog",
          "RouteDiagnosticLog",
          "IKEDiagnosticLog",
        ];

        const enabledMetrics = diagDef.enabledMetrics ?? ["AllMetrics"];

        const diagSetting = new MonitorDiagnosticSetting(
          this,
          `diagnostic-setting-${sanitizedId}-${index}`,
          {
            provider: provider,
            name: diagDef.name,
            targetResourceId: diagDef.targetResourceId,
            logAnalyticsWorkspaceId: this.logAnalyticsWorkspace!.id,
            enabledLog: enabledLogs.map((category) => ({ category })),
            enabledMetric: enabledMetrics.map((category) => ({ category })),
          },
        );

        this.createdDiagnosticSettings[diagDef.name] = diagSetting;
      });
    }

    // 3. Create Action Groups
    if (config.actionGroups) {
      config.actionGroups.forEach((groupDef, index) => {
        const sanitizedId = groupDef.name.replace(/[^a-zA-Z0-9]/g, "-");

        const actionGroup = new MonitorActionGroup(
          this,
          `action-group-${sanitizedId}-${index}`,
          {
            provider: provider,
            resourceGroupName: config.resourceGroupName,
            name: groupDef.name,
            shortName: groupDef.shortName,
            tags: config.tags,
            emailReceiver: groupDef.emailReceivers?.map((er) => ({
              name: er.name,
              emailAddress: er.emailAddress,
              useCommonAlertSchema: er.useCommonAlertSchema ?? true,
            })),
          },
        );

        this.createdActionGroups[groupDef.name] = actionGroup;
      });
    }

    // 4. Create log alerts (Scheduled Query Rules, v2 API)
    if (config.logAlerts) {
      config.logAlerts.forEach((logDef, index) => {
        const sanitizedId = logDef.name.replace(/[^a-zA-Z0-9]/g, "-");

        const resolvedActionGroupIds: string[] = [];
        if (logDef.actionGroups) {
          logDef.actionGroups.forEach((groupName) => {
            const localGroup = this.createdActionGroups[groupName];
            resolvedActionGroupIds.push(localGroup ? localGroup.id : groupName);
          });
        }

        const logAlert = new MonitorScheduledQueryRulesAlertV2(
          this,
          `log-alert-${sanitizedId}-${index}`,
          {
            provider: provider,
            resourceGroupName: config.resourceGroupName,
            location: config.location,
            name: logDef.name,
            scopes: logDef.scopes,
            severity: logDef.severity,
            evaluationFrequency: logDef.evaluationFrequency,
            windowDuration: logDef.windowDuration,
            enabled: logDef.enabled ?? true,
            tags: config.tags,
            description: logDef.description,
            criteria: [
              {
                query: logDef.query,
                timeAggregationMethod: logDef.timeAggregationMethod,
                metricMeasureColumn: logDef.metricMeasureColumn,
                operator: logDef.operator,
                threshold: logDef.threshold,
                failingPeriods: logDef.failingPeriods,
              },
            ],
            action:
              resolvedActionGroupIds.length > 0
                ? { actionGroups: resolvedActionGroupIds }
                : undefined,
          },
        );

        if (logDef.actionGroups) {
          logDef.actionGroups.forEach((groupName) => {
            const localGroup = this.createdActionGroups[groupName];
            if (localGroup) {
              addTerraformDependency(logAlert, localGroup);
            }
          });
        }

        this.createdLogAlerts[logDef.name] = logAlert;
      });
    }

    // 5. Create metric alerts
    if (config.metricAlerts) {
      config.metricAlerts.forEach((metricDef, index) => {
        const sanitizedId = metricDef.name.replace(/[^a-zA-Z0-9]/g, "-");

        const resolvedActionGroupIds: string[] = [];
        if (metricDef.actionGroups) {
          metricDef.actionGroups.forEach((groupName) => {
            const localGroup = this.createdActionGroups[groupName];
            resolvedActionGroupIds.push(localGroup ? localGroup.id : groupName);
          });
        }

        const metricAlert = new MonitorMetricAlert(
          this,
          `metric-alert-${sanitizedId}-${index}`,
          {
            provider: provider,
            resourceGroupName: config.resourceGroupName,
            name: metricDef.name,
            scopes: metricDef.scopes,
            frequency: metricDef.frequency,
            windowSize: metricDef.windowSize,
            tags: config.tags,
            description: metricDef.description,
            action: resolvedActionGroupIds.map((id) => ({
              actionGroupId: id,
            })),
            criteria: [
              {
                metricNamespace: metricDef.metricNamespace,
                metricName: metricDef.metricName,
                aggregation: metricDef.aggregation,
                operator: metricDef.operator,
                threshold: metricDef.threshold,
              },
            ],
          },
        );

        if (metricDef.actionGroups) {
          metricDef.actionGroups.forEach((groupName) => {
            const localGroup = this.createdActionGroups[groupName];
            if (localGroup) {
              addTerraformDependency(metricAlert, localGroup);
            }
          });
        }

        this.createdMetricAlerts[metricDef.name] = metricAlert;
      });
    }
  }
}
