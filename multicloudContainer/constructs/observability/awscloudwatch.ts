import { CloudwatchLogGroup } from "@cdktn/provider-aws/lib/cloudwatch-log-group";
import { CloudwatchLogMetricFilter } from "@cdktn/provider-aws/lib/cloudwatch-log-metric-filter";
import { CloudwatchMetricAlarm } from "@cdktn/provider-aws/lib/cloudwatch-metric-alarm";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Construct } from "constructs";

/**
 * Configuration for a CloudWatch Log Group.
 */
export interface AwsLogGroupDefinition {
  /** The name of the log group. */
  name: string;
  /** Specifies the number of days you want to retain log events in the specified log group. Default is 0 (infinite). */
  retentionInDays?: number;
  /** Optional Key-value map of resource tags. */
  tags?: { [key: string]: string };
}

/**
 * Configuration for a CloudWatch Log Metric Filter.
 */
export interface AwsMetricFilterDefinition {
  /** A symbolic name for the metric filter. */
  name: string;
  /** The name of the log group to associate the metric filter with (can be a local name or an external one). */
  logGroupName: string;
  /** A valid CloudWatch Logs filter pattern for extracting metric data (e.g., '"[ERROR]"'). */
  pattern: string;
  /** The name of the CloudWatch metric to which the monitor information should be published. */
  metricName: string;
  /** The destination namespace of the CloudWatch metric. */
  metricNamespace: string;
  /** The value to publish to the CloudWatch metric when a filter pattern matches. Default is "1". */
  value?: string;
  /** The value to emit when a filter pattern does not match a log event. */
  defaultValue?: string;
}

/**
 * Configuration for a CloudWatch Metric Alarm.
 */
export interface AwsMetricAlarmDefinition {
  /** The descriptive name for the alarm. */
  alarmName: string;
  /** The arithmetic operation to use when comparing the specified Statistic and Threshold. */
  comparisonOperator:
    | "GreaterThanOrEqualToThreshold"
    | "GreaterThanThreshold"
    | "LessThanThreshold"
    | "LessThanOrEqualToThreshold";
  /** The number of periods over which data is compared to the specified threshold. */
  evaluationPeriods: number;
  /** The name for the alarm's associated metric. */
  metricName: string;
  /** The namespace for the alarm's associated metric. */
  namespace: string;
  /** The period in seconds over which the specified statistic is applied. (e.g., 60, 300). */
  period: number;
  /** The statistic to apply to the alarm's associated metric (e.g., "SampleCount", "Average", "Sum", "Minimum", "Maximum"). */
  statistic: string;
  /** The value against which the specified statistic is compared. */
  threshold: number;
  /** The list of actions to execute when this alarm transitions into an ALARM state (e.g., SNS Topic ARNs). */
  alarmActions?: string[];
  /** The description for the alarm. */
  alarmDescription?: string;
}

/**
 * Configuration interface for the AwsCloudWatchResources construct.
 */
export interface AwsCloudWatchResourcesConfig {
  /** Array of CloudWatch Log Group definitions. Optional. */
  logGroups?: AwsLogGroupDefinition[];
  /** Array of Log Metric Filter definitions. Optional. */
  metricFilters?: AwsMetricFilterDefinition[];
  /** Array of Metric Alarm definitions. Optional. */
  metricAlarms?: AwsMetricAlarmDefinition[];
  /** Optional lifecycle hooks or custom operations to execute during creation. */
  hooks?: {
    onLogGroupCreated?: (
      logGroup: CloudwatchLogGroup,
      definition: AwsLogGroupDefinition,
    ) => void;
    onMetricFilterCreated?: (
      filter: CloudwatchLogMetricFilter,
      definition: AwsMetricFilterDefinition,
    ) => void;
    onMetricAlarmCreated?: (
      alarm: CloudwatchMetricAlarm,
      definition: AwsMetricAlarmDefinition,
    ) => void;
  };
}

/**
 * A flexible construct to manage independent CloudWatch Logs, Metric Filters,
 * and Metric Alarms with explicit resource separation and lifecycle hooks.
 */
export class AwsCloudWatchResources extends Construct {
  /** Map of created CloudwatchLogGroup instances, accessible by their configured name. */
  public readonly createdLogGroups: Record<string, CloudwatchLogGroup> = {};
  /** Map of created CloudwatchLogMetricFilter instances, accessible by their configured name. */
  public readonly createdMetricFilters: Record<
    string,
    CloudwatchLogMetricFilter
  > = {};
  /** Map of created CloudwatchMetricAlarm instances, accessible by their configured alarmName. */
  public readonly createdMetricAlarms: Record<string, CloudwatchMetricAlarm> =
    {};

  constructor(
    scope: Construct,
    id: string,
    provider: AwsProvider,
    config: AwsCloudWatchResourcesConfig,
  ) {
    super(scope, id);

    // 1. Independent CloudWatch Log Groups Creation
    if (config.logGroups) {
      config.logGroups.forEach((logDef, index) => {
        const sanitizedId = logDef.name.replace(/[^a-zA-Z0-9-_]/g, "-");

        const logGroup = new CloudwatchLogGroup(
          this,
          `aws-log-group-${sanitizedId}-${index}`,
          {
            provider: provider,
            name: logDef.name,
            retentionInDays: logDef.retentionInDays,
            tags: logDef.tags,
          },
        );

        this.createdLogGroups[logDef.name] = logGroup;

        if (config.hooks?.onLogGroupCreated) {
          config.hooks.onLogGroupCreated(logGroup, logDef);
        }
      });
    }

    // 2. Independent CloudWatch Log Metric Filters Creation
    if (config.metricFilters) {
      config.metricFilters.forEach((filterDef, index) => {
        const sanitizedId = filterDef.name.replace(/[^a-zA-Z0-9-_]/g, "-");

        // Safely evaluate whether the targeted Log Group was created locally inside this construct
        const localLogGroup = this.createdLogGroups[filterDef.logGroupName];
        const finalLogGroupName = localLogGroup
          ? localLogGroup.name
          : filterDef.logGroupName;

        const metricFilter = new CloudwatchLogMetricFilter(
          this,
          `aws-metric-filter-${sanitizedId}-${index}`,
          {
            provider: provider,
            name: filterDef.name,
            logGroupName: finalLogGroupName,
            pattern: filterDef.pattern,
            metricTransformation: {
              name: filterDef.metricName,
              namespace: filterDef.metricNamespace,
              value: filterDef.value ?? "1",
              defaultValue: filterDef.defaultValue,
            },
          },
        );

        // If local log group exists, ensure explicit deployment order graph to avoid race conditions
        if (localLogGroup) {
          metricFilter.node.addDependency(localLogGroup);
        }

        this.createdMetricFilters[filterDef.name] = metricFilter;

        if (config.hooks?.onMetricFilterCreated) {
          config.hooks.onMetricFilterCreated(metricFilter, filterDef);
        }
      });
    }

    // 3. Independent CloudWatch Metric Alarms Creation
    if (config.metricAlarms) {
      config.metricAlarms.forEach((alarmDef, index) => {
        const sanitizedId = alarmDef.alarmName.replace(/[^a-zA-Z0-9-_]/g, "-");

        const metricAlarm = new CloudwatchMetricAlarm(
          this,
          `aws-metric-alarm-${sanitizedId}-${index}`,
          {
            provider: provider,
            alarmName: alarmDef.alarmName,
            comparisonOperator: alarmDef.comparisonOperator,
            evaluationPeriods: alarmDef.evaluationPeriods,
            metricName: alarmDef.metricName,
            namespace: alarmDef.namespace,
            period: alarmDef.period,
            statistic: alarmDef.statistic,
            threshold: alarmDef.threshold,
            alarmActions: alarmDef.alarmActions,
            alarmDescription: alarmDef.alarmDescription,
          },
        );

        // Ensure dependency sorting if this alarm watches a metric generated by a local metric filter
        const localFilter = Object.values(this.createdMetricFilters).find(
          (f) =>
            f.metricTransformation.name === alarmDef.metricName &&
            f.metricTransformation.namespace === alarmDef.namespace,
        );
        if (localFilter) {
          metricAlarm.node.addDependency(localFilter);
        }

        this.createdMetricAlarms[alarmDef.alarmName] = metricAlarm;

        if (config.hooks?.onMetricAlarmCreated) {
          config.hooks.onMetricAlarmCreated(metricAlarm, alarmDef);
        }
      });
    }
  }
}
