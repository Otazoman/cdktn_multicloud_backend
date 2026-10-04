import * as settings from "./commonsettings";
import { CloudId } from "./commonsettings";

/**
 * VPN connection helpers. All code must use these functions instead of the
 * per-pair flags in commonsettings.ts, so that adding a cloud only means
 * adding entries to `connectionFlags` (and, later, replacing the flags with a
 * connection list).
 *
 * Values are read on every call (not cached) so that tests can override the
 * settings at runtime.
 */

export type CloudPair = readonly [CloudId, CloudId];

/** Per-pair flags in commonsettings.ts, as a list of pairs. */
const connectionFlags: ReadonlyArray<{
  pair: CloudPair;
  enabled: () => boolean;
}> = [
  { pair: ["aws", "google"], enabled: () => settings.awsToGoogle },
  { pair: ["aws", "azure"], enabled: () => settings.awsToAzure },
  { pair: ["google", "azure"], enabled: () => settings.googleToAzure },
];

/** Enabled direct VPN connections. */
export function vpnConnections(): CloudPair[] {
  return connectionFlags.filter((c) => c.enabled()).map((c) => c.pair);
}

/** True when a direct VPN connection between `a` and `b` is enabled. */
export function isConnected(a: CloudId, b: CloudId): boolean {
  return vpnConnections().some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

/** True when `cloud` takes part in at least one enabled VPN connection. */
export function isCloudConnected(cloud: CloudId): boolean {
  return vpnConnections().some(([x, y]) => x === cloud || y === cloud);
}
