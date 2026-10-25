import { Lazy, TerraformOutput, TerraformStack } from "cdktn";
import { Construct } from "constructs";
import { apiContainerConfig } from "../config/apicontainer";
import { buildStage } from "../config/buildstage";
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

// Each cloud's own database endpoint, per stack: without the private DNS
// the other clouds use it (AWS: the Aurora endpoint, which public DNS
// resolves to its private IP; Google Cloud: the Cloud SQL private IP)
const localDbHostsByStack = new WeakMap<TerraformStack, Partial<Record<CloudId, string>>>();

const AZURE_IP_UNSET = "azure-db-ip-not-recorded";

/**
 * Address of a peer's database for the other clouds' APIs (DB_<NODE>_HOST)
 * and for the database scripts: its private DNS name (hostZones), or without
 * the private DNS the database's own endpoint (AWS, Google Cloud: resolved
 * at the end of the synthesis, whatever order the clouds are built in) or
 * the recorded private IP (Azure, npm run build-stage -- 2 --azure-db-ip).
 */
function peerDbHost(stack: TerraformStack, peer: CloudId): string {
  const { database } = apiContainerConfig;
  if (settings.hostZones) {
    return database.privateDnsNames[peer];
  }
  if (peer === "azure") {
    if (database.azurePrivateIp) {
      return database.azurePrivateIp;
    }
    if (buildStage() >= 2) {
      throw new Error(
        "A cluster without the private DNS (hostZones off) reaches the Azure database by its " +
          "private IP: record it with npm run build-stage -- <stage> --azure-db-ip <ip>. Look it " +
          "up with: az network private-dns record-set a list -g <resource group> --zone-name " +
          "privatelink.postgres.database.azure.com --query '[].aRecords[0].ipv4Address' -o tsv " +
          '(docs/operations.md, "Build an environment")',
      );
    }
    // Stage 1: the database does not exist yet (placeholder images)
    return AZURE_IP_UNSET;
  }
  return Lazy.stringValue({
    produce: () => {
      const host = localDbHostsByStack.get(stack)?.[peer];
      if (!host) {
        throw new Error(
          `A cluster without the private DNS needs the endpoint of the ${peer} database, which ` +
            `comes with the API container on ${peer} (containers feature)`,
        );
      }
      return host;
    },
  });
}

/**
 * Without the private DNS, prints the database addresses for the database
 * scripts after the deploy (application scripts/cluster-setup.sh:
 * NODE_<NODE>_HOST=... scripts/cluster-setup.sh <cloud>).
 */
function clusterSetupHostsOutput(stack: TerraformStack, nodes: CloudId[]): void {
  if (settings.hostZones || nodes.length < 2 || stack.node.tryFindChild("cluster-setup-hosts")) {
    return;
  }
  new TerraformOutput(stack, "cluster-setup-hosts", {
    description: "Database addresses for the application's scripts/cluster-setup.sh (no private DNS)",
    value: Lazy.stringValue({
      produce: () =>
        nodes
          .map((node) => {
            const host =
              node === "azure"
                ? (apiContainerConfig.database.azurePrivateIp ?? AZURE_IP_UNSET)
                : (localDbHostsByStack.get(stack)?.[node] ?? "unknown");
            return `NODE_${node.toUpperCase()}_HOST=${host}`;
          })
          .join(" "),
    }),
  });
}

/**
 * Environment of the API container on `cloud` (config/apicontainer.ts), or
 * undefined when the cloud has no database (dbs feature off). The nodes are
 * the clouds whose dbs feature is enabled (topology "cluster"; one cloud
 * alone needs no VPN, two or more reach each other's databases through it,
 * by their private DNS names or, with hostZones off, by their endpoints and
 * the Azure database's recorded IP), or the cloud alone (topology "independent").
 *
 * `localDbHost` is the cloud's own database endpoint (apiLocalDbHost),
 * usable inside the cloud without the private DNS zones.
 */
export function apiContainerSettings(
  scope: Construct,
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
    if (!settings.useVpn || disconnected.length > 0) {
      throw new Error(
        `The API runs on ${nodes.length} clouds with a database (${nodes.join(", ")}): their ` +
          `APIs reach each other's databases through the VPN. ` +
          `Enable useVpn and VPN connections for every one of them ` +
          `(config/commonsettings.ts${disconnected.length > 0 ? `; not connected: ${disconnected.join(", ")}` : ""}), ` +
          `or set apiContainerConfig.topology to "independent" (every cloud alone, with its ` +
          `own data). Disabling dbs deletes those databases.`,
      );
    }
  }
  const { database } = apiContainerConfig;
  const stack = TerraformStack.of(scope);
  const localHost = localDbHost();
  const localHosts = localDbHostsByStack.get(stack) ?? {};
  localHosts[cloud] = localHost;
  localDbHostsByStack.set(stack, localHosts);
  clusterSetupHostsOutput(stack, nodes);
  return {
    environment: [
      { name: "CLOUD_ID", value: cloud },
      { name: "DB_HOST", value: localHost },
      { name: "DB_NAME", value: database.name },
      { name: "DB_USER", value: database.user },
      { name: "DB_SSLMODE", value: database.sslMode },
      { name: "PEER_NODES", value: peers.join(",") },
      ...peers.map((peer) => ({
        name: `DB_${peer.toUpperCase()}_HOST`,
        value: peerDbHost(stack, peer),
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
