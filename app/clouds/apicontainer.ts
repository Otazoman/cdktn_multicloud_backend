import { apiContainerConfig } from "../config/apicontainer";
import { CloudId } from "../config/commonsettings";
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
 * the clouds whose dbs feature is enabled.
 */
export function apiContainerSettings(cloud: CloudId): ApiContainerSettings | undefined {
  const nodes = CLOUDS.filter((c) => isFeatureEnabled(c, "dbs"));
  if (!nodes.includes(cloud)) {
    return undefined;
  }
  const { database } = apiContainerConfig;
  const peers = nodes.filter((c) => c !== cloud);
  return {
    environment: [
      { name: "CLOUD_ID", value: cloud },
      { name: "DB_HOST", value: database.hosts[cloud] },
      { name: "DB_NAME", value: database.name },
      { name: "DB_USER", value: database.user },
      { name: "DB_SSLMODE", value: database.sslMode },
      { name: "PEER_NODES", value: peers.join(",") },
      ...peers.map((peer) => ({
        name: `DB_${peer.toUpperCase()}_HOST`,
        value: database.hosts[peer],
      })),
    ],
    passwordVariables: [
      "DB_PASSWORD",
      ...peers.map((peer) => `DB_${peer.toUpperCase()}_PASSWORD`),
    ],
  };
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
