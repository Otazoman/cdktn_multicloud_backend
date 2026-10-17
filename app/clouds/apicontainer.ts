import { apiContainerConfig } from "../config/apicontainer";
import * as settings from "../config/commonsettings";
import { CloudId } from "../config/commonsettings";
import { isCloudConnected } from "../config/connections";
import { isFeatureEnabled } from "../config/features";

const CLOUDS: CloudId[] = ["aws", "google", "azure"];

export interface ApiContainerSettings {
  /** Plain environment variables */
  environment: { name: string; value: string }[];
  /** Environment variables whose value is the app_api password secret */
  passwordVariables: string[];
}

/**
 * Environment of the API container on `cloud` (config/apicontainer.ts), or
 * undefined when the cloud has no database (dbs feature off). The nodes are
 * the clouds whose dbs feature is enabled (topology "cluster"; one cloud
 * alone needs no VPN or private DNS, two or more reach each other's
 * databases through both), or the cloud alone (topology "independent").
 *
 * `localDbHost` is the cloud's own database endpoint (apiLocalDbHost),
 * usable inside the cloud without the private DNS zones.
 */
export function apiContainerSettings(
  cloud: CloudId,
  localDbHost: () => string,
): ApiContainerSettings | undefined {
  if (!isFeatureEnabled(cloud, "dbs")) {
    return undefined;
  }
  const nodes =
    apiContainerConfig.topology === "independent"
      ? [cloud]
      : CLOUDS.filter((c) => isFeatureEnabled(c, "dbs"));
  const peers = nodes.filter((c) => c !== cloud);
  if (peers.length > 0) {
    const disconnected = nodes.filter((c) => !isCloudConnected(c));
    if (!settings.useVpn || !settings.hostZones || disconnected.length > 0) {
      throw new Error(
        `The API runs on ${nodes.length} clouds with a database (${nodes.join(", ")}): their ` +
          `APIs reach each other's databases through the VPN and the private DNS names. ` +
          `Enable useVpn, hostZones and VPN connections for every one of them ` +
          `(config/commonsettings.ts${disconnected.length > 0 ? `; not connected: ${disconnected.join(", ")}` : ""}), ` +
          `or set apiContainerConfig.topology to "independent" (every cloud alone, with its ` +
          `own data). Disabling dbs deletes those databases.`,
      );
    }
  }
  const { database } = apiContainerConfig;
  return {
    environment: [
      { name: "CLOUD_ID", value: cloud },
      { name: "DB_HOST", value: localDbHost() },
      { name: "DB_NAME", value: database.name },
      { name: "DB_USER", value: database.user },
      { name: "DB_SSLMODE", value: database.sslMode },
      { name: "PEER_NODES", value: peers.join(",") },
      ...peers.map((peer) => ({
        name: `DB_${peer.toUpperCase()}_HOST`,
        value: database.privateDnsNames[peer],
      })),
    ],
    passwordVariables: [
      "DB_PASSWORD",
      ...peers.map((peer) => `DB_${peer.toUpperCase()}_PASSWORD`),
    ],
  };
}

/**
 * The endpoint of the cloud's PostgreSQL database for the API, from the
 * databases built on it: there must be exactly one.
 */
export function apiLocalDbHost(
  cloud: CloudId,
  databases: { name: string; host: string }[],
): string {
  if (databases.length !== 1) {
    throw new Error(
      `The API on ${cloud} needs exactly one PostgreSQL database built on ${cloud}; found ` +
        `${databases.length}${databases.length > 0 ? ` (${databases.map((d) => d.name).join(", ")})` : ""}. ` +
        `Set build: false on the others (config/${cloud}/).`,
    );
  }
  return databases[0].host;
}

/** Command of the journal pruning job (apiContainerConfig.journalPrune). */
export const JOURNAL_PRUNE_COMMAND = ["node", "dist/prune.js"];

/** Environment of the journal pruning job, in addition to the API's. */
export const journalPruneEnvironment = (): { name: string; value: string }[] => [
  { name: "JOURNAL_RETENTION_DAYS", value: String(apiContainerConfig.journalPrune.retentionDays) },
];

/** Readiness / liveness paths of the API (apiContainerConfig.readinessProbe). */
export const API_READINESS_PATH = "/readyz";
export const API_LIVENESS_PATH = "/healthz";
