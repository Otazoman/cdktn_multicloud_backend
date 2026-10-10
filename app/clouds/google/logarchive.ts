import { isFeatureEnabled } from "../../config/features";
import {
  PROJECT_NAME,
  gcpRunConfigs,
  googleLogArchiveConfig,
} from "../../config/google/googlesettings";
import { createGoogleLogArchive } from "../../constructs/observability/googlelogarchive";
import { resourceName } from "../../utils/naming";
import { GoogleBuildContext } from "./context";

/** 11. Log archive to Cloud Storage (feature: logArchive) */
export function createGoogleLogArchiveResources(ctx: GoogleBuildContext): void {
  const { scope, googleProvider } = ctx;

  if (!isFeatureEnabled("google", "logArchive")) {
    return;
  }
  const config = googleLogArchiveConfig;

  let filter = config.filter;
  if (!filter) {
    const built = isFeatureEnabled("google", "containers")
      ? gcpRunConfigs.filter((c) => c.build).map((c) => c.name)
      : [];
    const services = config.cloudRunServices ?? built;
    services.forEach((service) => {
      if (!built.includes(service)) {
        throw new Error(
          `Cloud Run service "${service}" in googleLogArchiveConfig.cloudRunServices was not found. ` +
            `Make sure it is defined in config/google/cloudrun.ts (build: true) and ` +
            `clouds.google.features.containers is enabled.`,
        );
      }
    });
    // Nothing to archive (an empty filter would match every log)
    if (services.length === 0) {
      return;
    }
    filter =
      'resource.type="cloud_run_revision" AND (' +
      services
        .map((service) => `resource.labels.service_name="${service}"`)
        .join(" OR ") +
      ")";
  }

  if (!config.bucket.name) {
    throw new Error(
      "googleLogArchiveConfig.bucket.name (config/google/monitoring.ts) is required when " +
        "clouds.google.features.logArchive is enabled (bucket names are globally unique).",
    );
  }

  createGoogleLogArchive(scope, googleProvider, {
    project: PROJECT_NAME,
    bucketName: config.bucket.name,
    location: config.bucket.location,
    forceDestroy: config.deleteOnDestroy,
    lifecycle: config.bucket.lifecycle,
    sinkName: resourceName(config.sinkName, "google", "log-archive"),
    filter,
    labels: config.labels,
  });
}
