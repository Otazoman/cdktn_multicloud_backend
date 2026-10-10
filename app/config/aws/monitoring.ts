import type {
  AwsMetricAlarmDefinition,
  AwsMetricFilterDefinition,
} from "../../constructs/observability/awscloudwatch";

/** Notification target: one SNS topic with email subscriptions. */
export interface AwsNotificationTargetConfig {
  /** Logical key referenced from alarms[].notify */
  key: string;
  /** SNS topic name. Default: <PROJECT_NAME>-aws-alerts-<key> */
  name?: string;
  /** Each recipient must confirm the subscription email before it is active. */
  emails: string[];
  tags?: { [key: string]: string };
}

/** CloudWatch alarm. `notify` lists notificationTargets keys. */
export type AwsAlarmConfig = Omit<
  AwsMetricAlarmDefinition,
  "alarmActions" | "okActions"
> & {
  notify?: string[];
  /** Also notify the `notify` targets when the alarm returns to OK. Default: false */
  notifyOnOk?: boolean;
};

/**
 * Alerting configuration (created only when `clouds.aws.features.alerting`
 * is enabled in commonsettings.ts).
 *
 * Example:
 *   notificationTargets: [{ key: "ops", emails: ["ops@example.com"] }],
 *   metricFilters: [{
 *     name: "api-service-errors",
 *     logGroupName: "/aws/ecs/api-service", // must exist in cloudwatchlogs.ts
 *     pattern: '"ERROR"',
 *     metricName: "ApiServiceErrors",
 *     metricNamespace: "Custom/ECS",
 *   }],
 *   alarms: [{
 *     alarmName: "ecs-api-service-cpu-high",
 *     namespace: "AWS/ECS",
 *     metricName: "CPUUtilization",
 *     dimensions: { ClusterName: "main-cluster", ServiceName: "api-service" },
 *     statistic: "Average",
 *     comparisonOperator: "GreaterThanThreshold",
 *     threshold: 80,
 *     period: 300,
 *     evaluationPeriods: 2,
 *     notify: ["ops"],
 *     notifyOnOk: true,
 *   }],
 */
export const awsAlertingConfig: {
  notificationTargets: AwsNotificationTargetConfig[];
  /**
   * CloudWatch Log Metric Filters. Add entries here to extract custom
   * metrics (e.g. error counts) from the log groups in cloudwatchlogs.ts.
   */
  metricFilters: AwsMetricFilterDefinition[];
  /**
   * CloudWatch Metric Alarms on built-in AWS metrics or on the custom
   * metrics produced by metricFilters.
   */
  alarms: AwsAlarmConfig[];
} = {
  notificationTargets: [],
  metricFilters: [],
  alarms: [],
};

/**
 * Log archive to S3 (created only when `clouds.aws.features.logArchive` is
 * enabled in commonsettings.ts).
 *
 * mode:
 * - "firehose": continuous delivery (subscription filter -> Firehose -> S3,
 *   one delivery stream per log group). Objects are gzip-compressed
 *   CloudWatch Logs records under <prefix>/YYYY/MM/DD/HH/. Charged per GB
 *   ingested by Firehose. A log group can have at most 2 subscription filters.
 * - "export": once per schedule (EventBridge Scheduler -> Lambda ->
 *   CreateExportTask -> S3). Each run exports the last full UTC day that
 *   ended at least 12 hours ago (log data can take up to 12 hours to become
 *   exportable) to <prefix>/YYYY/MM/DD/. Log groups are exported one at a
 *   time (one export task per account); the Lambda times out after 15 min.
 *
 * deleteOnDestroy: true deletes the bucket and the archived logs on destroy.
 * false keeps them, but destroy then fails while the bucket is not empty
 * (remove the bucket from the state before destroying to keep it).
 */
export const awsLogArchiveConfig: {
  deleteOnDestroy: boolean;
  mode: "firehose" | "export";
  bucket: {
    /** Required (globally unique) when logArchive is enabled */
    name?: string;
    lifecycle?: { transitionToGlacierDays?: number; expireDays?: number };
  };
  /** Log groups to archive. Names must exist in cloudwatchlogs.ts */
  logGroups: string[];
  firehose: { bufferingSizeMb: number; bufferingIntervalSeconds: number };
  export: {
    scheduleExpression: string;
    scheduleExpressionTimezone?: string;
    lambdaLogRetentionDays: number;
  };
  /**
   * Optional names. Defaults: <PROJECT_NAME>-aws-log-archive-<role> and, per
   * log group, <PROJECT_NAME>-aws-log-archive-<log group> (stream /
   * subscription filter).
   */
  names?: {
    logsRoleName?: string;
    firehoseRoleName?: string;
    lambdaName?: string;
    lambdaRoleName?: string;
    scheduleName?: string;
    schedulerRoleName?: string;
    streamNames?: Record<string, string>;
    subscriptionFilterNames?: Record<string, string>;
  };
  tags?: { [key: string]: string };
} = {
  deleteOnDestroy: true,
  mode: "firehose",
  bucket: {
    name: undefined,
    lifecycle: { transitionToGlacierDays: 30, expireDays: 365 },
  },
  logGroups: ["/aws/ecs/api-service", "/aws/ecs/worker-service"],
  firehose: { bufferingSizeMb: 5, bufferingIntervalSeconds: 300 },
  export: {
    scheduleExpression: "cron(0 2 * * ? *)",
    scheduleExpressionTimezone: "Asia/Tokyo",
    lambdaLogRetentionDays: 14,
  },
  tags: { Component: "LogArchive", ManagedBy: "CDKTN" },
};
