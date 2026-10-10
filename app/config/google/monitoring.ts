import { LOCATION } from "./common";
import type {
  GcpAlertPolicyDefinition,
  GcpLogMetricDefinition,
} from "../../constructs/observability/googlecloudmonitoring";

/** Notification target: one email notification channel per address. */
export interface GoogleNotificationTargetConfig {
  /** Logical key referenced from alertPolicies[].notify */
  key: string;
  /** Channel display name prefix. Default: <PROJECT_NAME>-google-alerts-<key> */
  name?: string;
  emails: string[];
}

/** Alert policy. `notify` lists notificationTargets keys. */
export type GoogleAlertPolicyConfig = Omit<
  GcpAlertPolicyDefinition,
  "notificationChannels"
> & {
  notify?: string[];
};

/**
 * Alerting configuration (created only when `clouds.google.features.alerting`
 * is enabled in commonsettings.ts).
 *
 * Example:
 *   notificationTargets: [{ key: "ops", emails: ["ops@example.com"] }],
 *   alertPolicies: [{
 *     displayName: "cloud-run-web-cpu-high",
 *     combiner: "OR",
 *     conditionFilter:
 *       'resource.type = "cloud_run_revision" AND ' +
 *       'resource.labels.service_name = "web-service-with-lb" AND ' +
 *       'metric.type = "run.googleapis.com/container/cpu/utilizations"',
 *     aggregation: {
 *       perSeriesAligner: "ALIGN_PERCENTILE_99",
 *       alignmentPeriod: "300s",
 *     },
 *     duration: "300s",
 *     comparison: "COMPARISON_GT",
 *     thresholdValue: 0.8,
 *     notify: ["ops"],
 *   }],
 */
export const googleAlertingConfig: {
  notificationTargets: GoogleNotificationTargetConfig[];
  /** Log-based metrics usable from alertPolicies (metric type "logging.googleapis.com/user/<name>") */
  logMetrics: GcpLogMetricDefinition[];
  alertPolicies: GoogleAlertPolicyConfig[];
} = {
  notificationTargets: [],
  logMetrics: [],
  alertPolicies: [],
};

/**
 * Log archive to Cloud Storage (created only when
 * `clouds.google.features.logArchive` is enabled in commonsettings.ts).
 *
 * A log sink writes the logs of the Cloud Run services to the bucket in
 * hourly batches. The sink is independent of the _Default exclusions
 * (cloudlogging.ts), so services with `logs: false` are archived too.
 *
 * deleteOnDestroy: true deletes the bucket and the archived logs on destroy.
 * false keeps them, but destroy then fails while the bucket is not empty
 * (remove the bucket from the state before destroying to keep it).
 */
export const googleLogArchiveConfig: {
  deleteOnDestroy: boolean;
  bucket: {
    /** Required (globally unique) when logArchive is enabled */
    name?: string;
    location: string;
    lifecycle?: { toArchiveClassDays?: number; deleteDays?: number };
  };
  /** Default: <PROJECT_NAME>-google-log-archive */
  sinkName?: string;
  /** Cloud Run services to archive. Omitted: every built service */
  cloudRunServices?: string[];
  /** Logging query used instead of the one built from cloudRunServices */
  filter?: string;
  labels?: { [key: string]: string };
} = {
  deleteOnDestroy: true,
  bucket: {
    name: undefined,
    location: LOCATION,
    lifecycle: { toArchiveClassDays: 30, deleteDays: 365 },
  },
  labels: { component: "log-archive", managed_by: "cdktn" },
};
