// ---------------------------------------------------------------------------
// API container settings (FEAT-01 §7, §9 #5)
//
// Applied to the CI/CD deploy target of each cloud (ECS service, Cloud Run
// service, Container App) when the cloud's dbs feature is enabled. Every
// API reads from its own cloud's database and writes to the primary, which
// may be any node, so each one gets the settings of every node
// (application repository: README "Environment variables").
// ---------------------------------------------------------------------------

import { buildStage } from "./buildstage";
import type { CloudId } from "./commonsettings";
import { byEnv } from "./environment";

// The three settings that follow the first deployment (config/buildstage.ts)
const stage = buildStage();

export const apiContainerConfig = {
  /**
   * "cluster": the clouds with a database form one cluster: every API
   * writes to the primary and the databases replicate (needs useVpn,
   * hostZones and VPN connections between them; synthesis fails otherwise).
   * "independent": every cloud runs alone on its own database, with its own
   * data (no VPN or private DNS needed). Turning independent clouds into a
   * cluster later keeps the data of one of them only (the others are
   * re-seeded; application docs/operations.md).
   */
  topology: byEnv<"cluster" | "independent">({
    default: "cluster",
    // dev runs each cloud alone until the VPN and private DNS are tested
    // dev: "independent",
  }),
  database: {
    /** Database of the API on every node (the replication scripts use one name) */
    name: "appdb",
    /** Role the API connects as (application scripts/api-role-setup.sh) */
    user: "app_api",
    /** DB_SSLMODE: disable | require | verify-full */
    sslMode: "require",
    /**
     * Private DNS name of each node's database, used by the APIs of the other
     * clouds (DB_<NODE>_HOST) through the VPN; needs hostZones
     * (config/<cloud>/privatezone.ts, config/azure/azuredatabase/databases.ts
     * cnameRecordName). AWS: the Aurora cluster (writer) endpoint. An API
     * reaches its own cloud's database (DB_HOST) by the database's own
     * endpoint, so one cloud alone needs no VPN or private DNS.
     */
    privateDnsNames: {
      aws: "aurora-postgres.aws.inner",
      google: "cloudsql-postgres.google.inner",
      azure: "postgres-prod.azure.inner",
    } as Record<CloudId, string>,
  },
  /**
   * Secret holding the app_api password (key in config/<cloud>/secrets.ts).
   * Every node's app_api has the same password, so DB_PASSWORD and every
   * DB_<NODE>_PASSWORD reference this one secret of the container's cloud.
   */
  passwordSecretKey: "db-api-password",
  /**
   * Azure: reference the Key Vault secret from the Container App. A Container
   * App cannot start a revision whose Key Vault secret does not exist, and
   * the secret is created from the Azure VM after the vault (FEAT-01 §7):
   * build stage 2 and later (npm run build-stage -- 2 after the secrets).
   */
  azureSecretReady: stage >= 2,
  /**
   * Use /readyz as the readiness check (ALB target groups, Cloud Run startup
   * probe, Container Apps readiness probe) and /healthz as liveness. The
   * placeholder images answer only "/": build stage 3 (npm run build-stage
   * -- 3 after the API image has been deployed by CI/CD).
   */
  readinessProbe: stage >= 3,
  /**
   * Scheduled job that deletes old write-journal rows (application
   * src/prune.ts: `node dist/prune.js`). Created on every cloud with a
   * database, with the API's image, settings and network; only the primary
   * deletes, so running it on every cloud keeps it going during an outage.
   */
  journalPrune: {
    /**
     * Build stage 3 (after CI/CD has deployed the API, with readinessProbe):
     * Google Cloud and Azure create the job with the API service's current
     * image (CI/CD updates it afterwards); AWS runs the latest revision of
     * the API's task definition. Azure also needs azureSecretReady.
     */
    enabled: stage >= 3,
    /** JOURNAL_RETENTION_DAYS: how long writes and idempotency keys are kept */
    retentionDays: 30,
    /** Daily, at different times per cloud (each cloud's own syntax) */
    schedules: {
      /** EventBridge Scheduler, in timeZone */
      aws: "cron(0 3 * * ? *)",
      /** Cloud Scheduler (unix cron), in timeZone */
      google: "20 3 * * *",
      /** Container Apps Jobs: UTC only (03:40 in Asia/Tokyo) */
      azure: "40 18 * * *",
    },
    timeZone: "Asia/Tokyo",
    /** Job names (omitted: <PROJECT_NAME>-<cloud>-journal-prune) */
    names: {} as Partial<Record<CloudId, string>>,
  },
};
