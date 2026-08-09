import { LogAnalyticsWorkspace } from "@cdktn/provider-azurerm/lib/log-analytics-workspace";
import { MonitorActionGroup } from "@cdktn/provider-azurerm/lib/monitor-action-group";
import { MonitorDiagnosticSetting } from "@cdktn/provider-azurerm/lib/monitor-diagnostic-setting";
import { MonitorMetricAlert } from "@cdktn/provider-azurerm/lib/monitor-metric-alert";
import { MonitorScheduledQueryRulesAlert } from "@cdktn/provider-azurerm/lib/monitor-scheduled-query-rules-alert";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Construct } from "constructs";

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
 * Definition for a log alert (Scheduled Query Rules).
 */
export interface AzureLogAlertDefinition {
  name: string;
  dataSourceId: string;
  query: string;
  timeWindowInMinutes: number;
  frequencyInMinutes: number;
  threshold: number;
  operator: "GreaterThan" | "LessThan" | "Equal";
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
    MonitorScheduledQueryRulesAlert
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

    // 4. Create log alerts (Scheduled Query Rules)
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

        const logAlert = new MonitorScheduledQueryRulesAlert(
          this,
          `log-alert-${sanitizedId}-${index}`,
          {
            provider: provider,
            resourceGroupName: config.resourceGroupName,
            location: config.location,
            name: logDef.name,
            dataSourceId: logDef.dataSourceId,
            query: logDef.query,
            timeWindow: logDef.timeWindowInMinutes,
            frequency: logDef.frequencyInMinutes,
            enabled: logDef.enabled ?? true,
            tags: config.tags,
            description: logDef.description,
            action: {
              actionGroup: resolvedActionGroupIds,
            },
            trigger: {
              operator: logDef.operator,
              threshold: logDef.threshold,
            },
          },
        );

        if (logDef.actionGroups) {
          logDef.actionGroups.forEach((groupName) => {
            const localGroup = this.createdActionGroups[groupName];
            if (localGroup) {
              logAlert.node.addDependency(localGroup);
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
              metricAlert.node.addDependency(localGroup);
            }
          });
        }

        this.createdMetricAlerts[metricDef.name] = metricAlert;
      });
    }
  }
}
