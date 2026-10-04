import * as settings from "./commonsettings";
import { CloudFeatures, CloudId } from "./commonsettings";

/**
 * Per-cloud switches (see `clouds` in commonsettings.ts). Values are read on
 * every call (not cached) so that tests can override the settings at runtime.
 */

/** True when the cloud (its network and everything on it) is enabled. */
export function isCloudEnabled(cloud: CloudId): boolean {
  return settings.clouds[cloud].enabled;
}

/** True when both the cloud and the feature are enabled. */
export function isFeatureEnabled(
  cloud: CloudId,
  feature: keyof CloudFeatures,
): boolean {
  return isCloudEnabled(cloud) && settings.clouds[cloud].features[feature];
}
