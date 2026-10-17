// ---------------------------------------------------------------------------
// API container settings (FEAT-01 §7, §9 #5)
//
// Applied to the CI/CD deploy target of each cloud (ECS service, Cloud Run
// service, Container App) when the cloud's dbs feature is enabled. Every
// API reads from its own cloud's database and writes to the primary, which
// may be any node, so each one gets the settings of every node
// (application repository: README "Environment variables").
// ---------------------------------------------------------------------------

import type { CloudId } from "./commonsettings";
import { byEnv } from "./environment";

export const apiContainerConfig = {
  database: {
    /** Database of the API on every node (the replication scripts use one name) */
    name: "appdb",
    /** Role the API connects as (application scripts/api-role-setup.sh) */
    user: "app_api",
    /** DB_SSLMODE: disable | require | verify-full */
    sslMode: "require",
    /**
     * Address of each node's database, reachable from every cloud through
     * the VPN and the private DNS zones (config/<cloud>/privatezone.ts,
     * config/azure/azuredatabase/databases.ts cnameRecordName). AWS: the
     * Aurora cluster (writer) endpoint.
     */
    hosts: {
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
   * deploy with false, set the secret, then deploy with true.
   */
  azureSecretReady: byEnv<boolean>({ default: false }),
  /**
   * Use /readyz as the readiness check (ALB target groups, Cloud Run startup
   * probe, Container Apps readiness probe) and /healthz as liveness. The
   * placeholder images answer only "/": set true after the API image has
   * been deployed by CI/CD.
   */
  readinessProbe: byEnv<boolean>({ default: false }),
  /**
   * Scheduled job that deletes old write-journal rows (application
   * src/prune.ts: `node dist/prune.js`). Created on every cloud with a
   * database, with the API's image, settings and network; only the primary
   * deletes, so running it on every cloud keeps it going during an outage.
   */
  journalPrune: {
    /**
     * Set true after CI/CD has deployed the API: Google Cloud and Azure
     * create the job with the API service's current image (CI/CD updates it
     * afterwards); AWS runs the latest revision of the API's task definition.
     * Azure also needs azureSecretReady.
     */
    enabled: byEnv<boolean>({ default: false }),
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
