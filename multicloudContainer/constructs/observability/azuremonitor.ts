import { MonitorActionGroup } from "@cdktn/provider-azurerm/lib/monitor-action-group";
import { MonitorMetricAlert } from "@cdktn/provider-azurerm/lib/monitor-metric-alert";
import { MonitorScheduledQueryRulesAlert } from "@cdktn/provider-azurerm/lib/monitor-scheduled-query-rules-alert";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Construct } from "constructs";

/**
 * Configuration for an Azure Monitor Action Group (Notification channel).
 */
export interface AzureActionGroupDefinition {
  /** The unique name of the action group. */
  name: string;
  /** The short name of the action group (max 12 characters). */
  shortName: string;
  /** Array of email receivers configuration. Optional. */
  emailReceivers?: Array<{
    name: string;
    emailAddress: string;
    useCommonAlertSchema?: boolean;
  }>;
}

/**
 * Configuration for an Azure Monitor Log-based Alert (Scheduled Query Rules).
 */
export interface AzureLogAlertDefinition {
  /** The descriptive name for the log alert rule. */
  name: string;
  /** The resource ID of the Log Analytics Workspace to target for the query execution. */
  dataSourceId: string;
  /** The Kusto Query Language (KQL) query block to run (e.g., 'AppRequests | where ResultCode == "500"'). */
  query: string;
  /** Time window for which data is queried in minutes (e.g., 5, 15). */
  timeWindowInMinutes: number;
  /** How often the alert query should be executed in minutes. */
  frequencyInMinutes: number;
  /** The threshold value to check against the results. */
  threshold: number;
  /** The comparison operator (e.g., "GreaterThan", "LessThan", "Equal"). */
  operator: "GreaterThan" | "LessThan" | "Equal";
  /** List of Action Group names (local name or full Azure Resource ID) to notify when triggered. */
  actionGroups?: string[];
  /** Optional description for the alert rule. */
  description?: string;
}

/**
 * Configuration for an Azure Monitor Metric Alert.
 */
export interface AzureMetricAlertDefinition {
  /** The descriptive name for the metric alert rule. */
  name: string;
  /** Array of target resource IDs to monitor (e.g., App Service ID, VM ID). */
  scopes: string[];
  /** The namespace of the metric (e.g., "Microsoft.Web/sites", "Microsoft.Compute/virtualMachines"). */
  metricNamespace: string;
  /** The name of the metric to monitor (e.g., "CpuPercentage", "Requests"). */
  metricName: string;
  /** The statistic aggregation type (e.g., "Average", "Minimum", "Maximum", "Total", "Count"). */
  aggregation: "Average" | "Minimum" | "Maximum" | "Total" | "Count";
  /** The operator used to compare the metric against the threshold. */
  operator:
    | "GreaterThan"
    | "GreaterThanOrEqualTo"
    | "LessThan"
    | "LessThanOrEqualTo";
  /** The threshold value that triggers the alert. */
  threshold: number;
  /** The period of time that's used to monitor alert activity (ISO 8601 duration string, e.g., "PT1M", "PT5M"). */
  frequency: string;
  /** The period of time over which criteria is evaluated (ISO 8601 duration string, e.g., "PT5M", "PT15M"). */
  windowSize: string;
  /** List of Action Group names (local name or full Azure Resource ID) to notify when triggered. */
  actionGroups?: string[];
  /** Optional description for the alert rule. */
  description?: string;
}

/**
 * Configuration interface for the AzureMonitorResources construct.
 */
export interface AzureMonitorResourcesConfig {
  /** The name of the Resource Group where the monitoring components will reside. */
  resourceGroupName: string;
  /** The Azure region where resources will be provisioned (e.g., "japaneast"). */
  location: string;
  /** Array of Action Group definitions. Optional. */
  actionGroups?: AzureActionGroupDefinition[];
  /** Array of Log Alert (Scheduled Query Rules) definitions. Optional. */
  logAlerts?: AzureLogAlertDefinition[];
  /** Array of Metric Alert definitions. Optional. */
  metricAlerts?: AzureMetricAlertDefinition[];
  /** Optional lifecycle hooks or custom operations to execute during creation. */
  hooks?: {
    onActionGroupCreated?: (
      group: MonitorActionGroup,
      definition: AzureActionGroupDefinition,
    ) => void;
    onLogAlertCreated?: (
      alert: MonitorScheduledQueryRulesAlert,
      definition: AzureLogAlertDefinition,
    ) => void;
    onMetricAlertCreated?: (
      alert: MonitorMetricAlert,
      definition: AzureMetricAlertDefinition,
    ) => void;
  };
  /** Optional tags to apply to all created monitor components. */
  tags?: { [key: string]: string };
}

/**
 * A flexible construct to manage independent Azure Monitor Action Groups,
 * Scheduled Query Rules (Log Alerts), and Metric Alerts with automatic dependency sorting.
 */
export class AzureMonitorResources extends Construct {
  /** Map of created MonitorActionGroup instances, accessible by their configured name. */
  public readonly createdActionGroups: Record<string, MonitorActionGroup> = {};
  /** Map of created MonitorScheduledQueryRulesAlert instances, accessible by their configured name. */
  public readonly createdLogAlerts: Record<
    string,
    MonitorScheduledQueryRulesAlert
  > = {};
  /** Map of created MonitorMetricAlert instances, accessible by their configured name. */
  public readonly createdMetricAlerts: Record<string, MonitorMetricAlert> = {};

  constructor(
    scope: Construct,
    id: string,
    provider: AzurermProvider,
    config: AzureMonitorResourcesConfig,
  ) {
    super(scope, id);

    // 1. Independent Azure Monitor Action Groups Creation
    if (config.actionGroups) {
      config.actionGroups.forEach((groupDef, index) => {
        const sanitizedId = groupDef.name.replace(/[^a-zA-Z0-9]/g, "-");

        const actionGroup = new MonitorActionGroup(
          this,
          `azure-action-group-${sanitizedId}-${index}`,
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

        if (config.hooks?.onActionGroupCreated) {
          config.hooks.onActionGroupCreated(actionGroup, groupDef);
        }
      });
    }

    // 2. Independent Azure Monitor Log-based Alerts (Scheduled Query Rules) Creation
    if (config.logAlerts) {
      config.logAlerts.forEach((logDef, index) => {
        const sanitizedId = logDef.name.replace(/[^a-zA-Z0-9]/g, "-");

        // Resolve local Action Group resource IDs if referenced by local name
        const resolvedActionGroupIds: string[] = [];
        if (logDef.actionGroups) {
          logDef.actionGroups.forEach((groupName) => {
            const localGroup = this.createdActionGroups[groupName];
            resolvedActionGroupIds.push(localGroup ? localGroup.id : groupName);
          });
        }

        const logAlert = new MonitorScheduledQueryRulesAlert(
          this,
          `azure-log-alert-${sanitizedId}-${index}`,
          {
            provider: provider,
            resourceGroupName: config.resourceGroupName,
            location: config.location,
            name: logDef.name,
            dataSourceId: logDef.dataSourceId,
            query: logDef.query,
            timeWindow: logDef.timeWindowInMinutes,
            frequency: logDef.frequencyInMinutes,
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

        // Safe Dependency Graph Injection for local Action Groups
        if (logDef.actionGroups) {
          logDef.actionGroups.forEach((groupName) => {
            const localGroup = this.createdActionGroups[groupName];
            if (localGroup) {
              logAlert.node.addDependency(localGroup);
            }
          });
        }

        this.createdLogAlerts[logDef.name] = logAlert;

        if (config.hooks?.onLogAlertCreated) {
          config.hooks.onLogAlertCreated(logAlert, logDef);
        }
      });
    }

    // 3. Independent Azure Monitor Metric Alerts Creation
    if (config.metricAlerts) {
      config.metricAlerts.forEach((metricDef, index) => {
        const sanitizedId = metricDef.name.replace(/[^a-zA-Z0-9]/g, "-");

        // Resolve local Action Group resource IDs if referenced by local name
        const resolvedActionGroupIds: string[] = [];
        if (metricDef.actionGroups) {
          metricDef.actionGroups.forEach((groupName) => {
            const localGroup = this.createdActionGroups[groupName];
            resolvedActionGroupIds.push(localGroup ? localGroup.id : groupName);
          });
        }

        const metricAlert = new MonitorMetricAlert(
          this,
          `azure-metric-alert-${sanitizedId}-${index}`,
          {
            provider: provider,
            resourceGroupName: config.resourceGroupName,
            name: metricDef.name,
            scopes: metricDef.scopes,
            frequency: metricDef.frequency,
            windowSize: metricDef.windowSize,
            tags: config.tags,
            description: metricDef.description,
            action: resolvedActionGroupIds.map((id) => ({ actionGroupId: id })),
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

        // Safe Dependency Graph Injection for local Action Groups
        if (metricDef.actionGroups) {
          metricDef.actionGroups.forEach((groupName) => {
            const localGroup = this.createdActionGroups[groupName];
            if (localGroup) {
              metricAlert.node.addDependency(localGroup);
            }
          });
        }

        this.createdMetricAlerts[metricDef.name] = metricAlert;

        if (config.hooks?.onMetricAlertCreated) {
          config.hooks.onMetricAlertCreated(metricAlert, metricDef);
        }
      });
    }
  }
}
