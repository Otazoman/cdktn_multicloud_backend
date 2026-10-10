import { LoggingProjectBucketConfig } from "@cdktn/provider-google/lib/logging-project-bucket-config";
import { LoggingProjectExclusion } from "@cdktn/provider-google/lib/logging-project-exclusion";
import { LoggingProjectSink } from "@cdktn/provider-google/lib/logging-project-sink";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";

/** User-defined log bucket. */
export interface GoogleLogBucketParams {
  /** Construct ID key (Terraform address) */
  key: string;
  bucketId: string;
  location: string;
  retentionDays: number;
  enableAnalytics?: boolean;
}

/**
 * Logs of one resource (group): routed to `bucketKey` when set, and always
 * excluded from the _Default sink so that they are not stored twice.
 */
export interface GoogleLogRouteParams {
  /** Construct ID key (Terraform address) */
  key: string;
  /** Logging query that selects the logs */
  filter: string;
  /** Destination bucket key. Undefined: only excluded from _Default */
  bucketKey?: string;
  sinkName: string;
  exclusionName: string;
}

export interface GoogleLogRoutingParams {
  project: string;
  buckets: GoogleLogBucketParams[];
  routes: GoogleLogRouteParams[];
}

/**
 * Creates log buckets, sinks to them and _Default exclusions.
 */
export function createGoogleLogRouting(
  scope: Construct,
  provider: GoogleProvider,
  params: GoogleLogRoutingParams,
) {
  const buckets: Record<string, LoggingProjectBucketConfig> = {};
  params.buckets.forEach((bucket) => {
    buckets[bucket.key] = new LoggingProjectBucketConfig(
      scope,
      `log-bucket-${bucket.key}`,
      {
        provider,
        project: params.project,
        bucketId: bucket.bucketId,
        location: bucket.location,
        retentionDays: bucket.retentionDays,
        enableAnalytics: bucket.enableAnalytics,
      },
    );
  });

  const sinks: Record<string, LoggingProjectSink> = {};
  const exclusions: Record<string, LoggingProjectExclusion> = {};
  params.routes.forEach((route) => {
    if (route.bucketKey) {
      const bucket = buckets[route.bucketKey];
      // A sink to a log bucket in the same project needs no IAM grant.
      sinks[route.key] = new LoggingProjectSink(scope, `log-sink-${route.key}`, {
        provider,
        project: params.project,
        name: route.sinkName,
        destination: `logging.googleapis.com/${bucket.id}`,
        filter: route.filter,
      });
    }

    // Exclusions created through this API apply to the _Default sink.
    exclusions[route.key] = new LoggingProjectExclusion(
      scope,
      `log-exclusion-${route.key}`,
      {
        provider,
        project: params.project,
        name: route.exclusionName,
        filter: route.filter,
      },
    );
  });

  return { buckets, sinks, exclusions };
}
