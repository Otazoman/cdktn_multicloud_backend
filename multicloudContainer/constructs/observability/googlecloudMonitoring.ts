import { LoggingMetric } from "@cdktn/provider-google/lib/logging-metric";
import { MonitoringAlertPolicy } from "@cdktn/provider-google/lib/monitoring-alert-policy";
import { MonitoringNotificationChannel } from "@cdktn/provider-google/lib/monitoring-notification-channel";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";

/**
 * Configuration for a Google Cloud Logging Log-based Metric.
 */
export interface GcpLogMetricDefinition {
  /** The unique name of the log metric. */
  name: string;
  /** The advanced logs filter expression used to match log entries (e.g., 'resource.type="gce_instance" AND severity>=ERROR'). */
  filter: string;
  /** Optional description of the metric. */
  description?: string;
  /** Optional bucket configuration if this is a distribution metric. Default is a linear counter metric. */
  valueExtractor?: string;
}

/**
 * Configuration for a Google Cloud Monitoring Notification Channel.
 */
export interface GcpNotificationChannelDefinition {
  /** A human-readable name for this notification channel. */
  displayName: string;
  /** The type of the notification channel (e.g., "mail", "slack", "pagerduty"). */
  type: string;
  /** Configuration labels specific to the channel type (e.g., { "email_address": "ops@example.com" }). */
  labels: { [key: string]: string };
  /** Optional description or user-defined labels. */
  userLabels?: { [key: string]: string };
}

/**
 * Configuration for a Google Cloud Monitoring Alert Policy.
 */
export interface GcpAlertPolicyDefinition {
  /** A human-readable name for this alert policy. */
  displayName: string;
  /** The MQL (Monitoring Query Language) or PromQL/Filter based condition string. */
  combiner: "AND" | "OR" | "AND_WITH_MATCHING_RESOURCE";
  /** A single threshold filter configuration or MQL query block for simplicity. */
  conditionFilter: string;
  /** Duration over which the condition must be met before triggering (e.g., "60s", "300s"). */
  duration: string;
  /** Comparison operation (e.g., "COMPARISON_GT", "COMPARISON_LT"). */
  comparison:
    | "COMPARISON_GT"
    | "COMPARISON_GE"
    | "COMPARISON_LT"
    | "COMPARISON_LE"
    | "COMPARISON_EQ"
    | "COMPARISON_NE";
  /** The value to compare the time series against. */
  thresholdValue: number;
  /** List of notification channel displayNames (local or full resource names) to bind to this policy. */
  notificationChannels?: string[];
  /** Optional documentation block appended to the alert notification text. */
  documentationContent?: string;
}

/**
 * Configuration interface for the GcpMonitoringResources construct.
 */
export interface GcpMonitoringResourcesConfig {
  /** Google Cloud Project ID where resources will be provisioned. */
  projectId: string;
  /** Array of Log-based Metric definitions. Optional. */
  logMetrics?: GcpLogMetricDefinition[];
  /** Array of Notification Channel definitions. Optional. */
  notificationChannels?: GcpNotificationChannelDefinition[];
  /** Array of Alert Policy definitions. Optional. */
  alertPolicies?: GcpAlertPolicyDefinition[];
  /** Optional lifecycle hooks or custom operations to execute during creation. */
  hooks?: {
    onLogMetricCreated?: (
      metric: LoggingMetric,
      definition: GcpLogMetricDefinition,
    ) => void;
    onNotificationChannelCreated?: (
      channel: MonitoringNotificationChannel,
      definition: GcpNotificationChannelDefinition,
    ) => void;
    onAlertPolicyCreated?: (
      policy: MonitoringAlertPolicy,
      definition: GcpAlertPolicyDefinition,
    ) => void;
  };
}

/**
 * A flexible construct to manage independent Google Cloud Log Metrics,
 * Notification Channels, and Alert Policies with automatic dependency ordering.
 */
export class GcpMonitoringResources extends Construct {
  /** Map of created LoggingMetric instances, accessible by their configured name. */
  public readonly createdLogMetrics: Record<string, LoggingMetric> = {};
  /** Map of created MonitoringNotificationChannel instances, accessible by their displayName. */
  public readonly createdNotificationChannels: Record<
    string,
    MonitoringNotificationChannel
  > = {};
  /** Map of created MonitoringAlertPolicy instances, accessible by their displayName. */
  public readonly createdAlertPolicies: Record<string, MonitoringAlertPolicy> =
    {};

  constructor(
    scope: Construct,
    id: string,
    provider: GoogleProvider,
    config: GcpMonitoringResourcesConfig,
  ) {
    super(scope, id);

    // 1. Independent Google Cloud Log-based Metrics Creation
    if (config.logMetrics) {
      config.logMetrics.forEach((metricDef, index) => {
        const sanitizedId = metricDef.name.replace(/[^a-zA-Z0-9]/g, "-");

        // Fixed: Use LoggingMetric instead of LoggingLogMetric
        const logMetric = new LoggingMetric(
          this,
          `gcp-log-metric-${sanitizedId}-${index}`,
          {
            provider: provider,
            project: config.projectId,
            name: metricDef.name,
            filter: metricDef.filter,
            description: metricDef.description,
            valueExtractor: metricDef.valueExtractor,
          },
        );

        this.createdLogMetrics[metricDef.name] = logMetric;

        if (config.hooks?.onLogMetricCreated) {
          config.hooks.onLogMetricCreated(logMetric, metricDef);
        }
      });
    }

    // 2. Independent Google Cloud Notification Channels Creation
    if (config.notificationChannels) {
      config.notificationChannels.forEach((channelDef, index) => {
        const sanitizedId = channelDef.displayName.replace(
          /[^a-zA-Z0-9]/g,
          "-",
        );

        const channel = new MonitoringNotificationChannel(
          this,
          `gcp-notify-channel-${sanitizedId}-${index}`,
          {
            provider: provider,
            project: config.projectId,
            displayName: channelDef.displayName,
            type: channelDef.type,
            labels: channelDef.labels,
            userLabels: channelDef.userLabels,
          },
        );

        this.createdNotificationChannels[channelDef.displayName] = channel;

        if (config.hooks?.onNotificationChannelCreated) {
          config.hooks.onNotificationChannelCreated(channel, channelDef);
        }
      });
    }

    // 3. Independent Google Cloud Alert Policies Creation
    if (config.alertPolicies) {
      config.alertPolicies.forEach((policyDef, index) => {
        const sanitizedId = policyDef.displayName.replace(/[^a-zA-Z0-9]/g, "-");

        // Resolve notification channels
        const targetChannels: string[] = [];
        if (policyDef.notificationChannels) {
          policyDef.notificationChannels.forEach((channelName) => {
            const localChannel = this.createdNotificationChannels[channelName];
            if (localChannel) {
              targetChannels.push(localChannel.name);
            } else {
              targetChannels.push(channelName);
            }
          });
        }

        const alertPolicy = new MonitoringAlertPolicy(
          this,
          `gcp-alert-policy-${sanitizedId}-${index}`,
          {
            provider: provider,
            project: config.projectId,
            displayName: policyDef.displayName,
            combiner: policyDef.combiner,
            notificationChannels:
              targetChannels.length > 0 ? targetChannels : undefined,
            conditions: [
              {
                displayName: `${policyDef.displayName}-threshold-condition`,
                conditionThreshold: {
                  filter: policyDef.conditionFilter,
                  duration: policyDef.duration,
                  comparison: policyDef.comparison,
                  thresholdValue: policyDef.thresholdValue,
                  trigger: { count: 1 },
                  aggregations: [
                    {
                      alignmentPeriod: "60s",
                      perSeriesAligner: "ALIGN_RATE",
                    },
                  ],
                },
              },
            ],
            documentation: policyDef.documentationContent
              ? {
                  content: policyDef.documentationContent,
                  mimeType: "text/markdown",
                }
              : undefined,
          },
        );

        // Safe Dependency Graph Injection
        Object.keys(this.createdLogMetrics).forEach((metricName) => {
          if (policyDef.conditionFilter.includes(`user/${metricName}`)) {
            alertPolicy.node.addDependency(this.createdLogMetrics[metricName]);
          }
        });

        if (policyDef.notificationChannels) {
          policyDef.notificationChannels.forEach((channelName) => {
            const localChannel = this.createdNotificationChannels[channelName];
            if (localChannel) {
              alertPolicy.node.addDependency(localChannel);
            }
          });
        }

        this.createdAlertPolicies[policyDef.displayName] = alertPolicy;

        if (config.hooks?.onAlertPolicyCreated) {
          config.hooks.onAlertPolicyCreated(alertPolicy, policyDef);
        }
      });
    }
  }
}
