import { PROJECT_NAME } from "./common";

/**
 * Secret Manager secrets (FEAT-01). Created when clouds.google.features.dbs
 * is enabled.
 *
 * cdktn creates each secret with a dummy first version (initialValue). The
 * real value is added as a new version from the work VM with gcloud
 * (docs/operations.md, "Secrets"); Terraform keeps only the first version.
 */
export const googleSecretsConfig = {
  project: PROJECT_NAME,
  /** Dummy value stored by cdktn. Kept in the Terraform state. */
  initialValue: "CHANGE_ME",
  secrets: [
    {
      key: "db-api-password",
      // name: omitted → <PROJECT_NAME>-google-secret-db-api-password
      description: "Password of the role the API connects as (DB_PASSWORD)",
    },
    {
      key: "db-repl-password",
      description:
        "Password of the role the other databases connect as (logical replication)",
    },
  ] as { key: string; name?: string; description: string }[],
};
