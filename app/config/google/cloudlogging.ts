import { LOCATION } from "./common";

/**
 * Cloud Logging log buckets (equivalent of config/aws/cloudwatchlogs.ts).
 *
 * Resources with `logs: true` (vpn.ts, cloudrun.ts) route their logs to the
 * bucket named by their `logBucket` and are excluded from the _Default
 * bucket, so each log is stored (and charged) once. Resources with
 * `logs: false` are only excluded from _Default (not stored). Only buckets
 * referenced by a resource are created.
 *
 * Notes (Google Cloud):
 * - location cannot be changed after creation (changing it replaces the
 *   bucket). global / multi-regions add no resiliency over a single region.
 * - retentionDays: 1-3650. Retention beyond 30 days is charged.
 * - enableAnalytics cannot be turned off once enabled.
 * - A deleted bucket stays DELETE_REQUESTED for 7 days and its ID cannot be
 *   reused during that time. To deploy again within 7 days of a destroy,
 *   set a different bucketId.
 */
export interface GoogleLogBucketConfig {
  /** Logical key referenced from logBucket */
  key: string;
  /** Bucket ID. Default: <PROJECT_NAME>-google-logs-<key> */
  bucketId?: string;
  location: string;
  retentionDays: number;
  /** Upgrade to Observability Analytics (irreversible). Default: false */
  enableAnalytics?: boolean;
}

export const googleLogBucketsConfig: GoogleLogBucketConfig[] = [
  // VPN gateways and Cloud Routers (BGP)
  { key: "vpn", location: LOCATION, retentionDays: 30, enableAnalytics: false },
  // Cloud Run services
  { key: "cloudrun", location: LOCATION, retentionDays: 30, enableAnalytics: false },
];

/**
 * Optional names of the log sinks / _Default exclusions per route. Route
 * keys: "vpn", "cloudrun-<service name>". Defaults:
 * <PROJECT_NAME>-google-log-sink-<route> / <PROJECT_NAME>-google-log-exclusion-<route>.
 */
export const googleLogRouteNames: Record<
  string,
  { sinkName?: string; exclusionName?: string }
> = {};
