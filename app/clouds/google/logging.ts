import { useVpn } from "../../config/commonsettings";
import { isCloudConnected } from "../../config/connections";
import { isFeatureEnabled } from "../../config/features";
import {
  PROJECT_NAME,
  gcpRunConfigs,
  googleLogBucketsConfig,
  googleLogRouteNames,
  googleVpnParams,
} from "../../config/google/googlesettings";
import {
  GoogleLogRouteParams,
  createGoogleLogRouting,
} from "../../constructs/observability/googlelogging";
import { resourceName } from "../../utils/naming";
import { GoogleBuildContext } from "./context";

/**
 * 9. Log buckets, sinks and _Default exclusions for the VPN (when Google
 * takes part in a VPN connection) and Cloud Run (features.containers).
 */
export function createGoogleLogging(ctx: GoogleBuildContext): void {
  const { scope, googleProvider } = ctx;

  const sources: Array<{
    key: string;
    filter: string;
    logs: boolean;
    logBucket: string;
    label: string;
  }> = [];

  // Same condition as the Google VPN gateway (resources/vpnResources.ts)
  if (useVpn && isCloudConnected("google")) {
    sources.push({
      key: "vpn",
      filter: 'resource.type="vpn_gateway" OR resource.type="gce_router"',
      logs: googleVpnParams.logs,
      logBucket: googleVpnParams.logBucket,
      label: "googleVpnParams (config/google/vpn.ts)",
    });
  }

  if (isFeatureEnabled("google", "containers")) {
    gcpRunConfigs
      .filter((config) => config.build)
      .forEach((config) => {
        sources.push({
          key: `cloudrun-${config.name}`,
          filter:
            'resource.type="cloud_run_revision" AND ' +
            `resource.labels.service_name="${config.name}"`,
          logs: config.logs,
          logBucket: config.logBucket,
          label: `Cloud Run service "${config.name}" (config/google/cloudrun.ts)`,
        });
      });
  }

  if (sources.length === 0) {
    return;
  }

  const routes: GoogleLogRouteParams[] = sources.map((source) => {
    if (
      source.logs &&
      !googleLogBucketsConfig.some((bucket) => bucket.key === source.logBucket)
    ) {
      throw new Error(
        `Log bucket "${source.logBucket}" referenced by ${source.label} was not found. ` +
          `Make sure it is defined in config/google/cloudlogging.ts (googleLogBucketsConfig).`,
      );
    }
    const names = googleLogRouteNames[source.key];
    return {
      key: source.key,
      filter: source.filter,
      bucketKey: source.logs ? source.logBucket : undefined,
      sinkName: resourceName(names?.sinkName, "google", "log-sink", source.key),
      exclusionName: resourceName(
        names?.exclusionName,
        "google",
        "log-exclusion",
        source.key,
      ),
    };
  });

  const usedBucketKeys = new Set(routes.map((route) => route.bucketKey));

  createGoogleLogRouting(scope, googleProvider, {
    project: PROJECT_NAME,
    buckets: googleLogBucketsConfig
      .filter((bucket) => usedBucketKeys.has(bucket.key))
      .map((bucket) => ({
        key: bucket.key,
        bucketId: resourceName(bucket.bucketId, "google", "logs", bucket.key),
        location: bucket.location,
        retentionDays: bucket.retentionDays,
        enableAnalytics: bucket.enableAnalytics,
      })),
    routes,
  });
}
