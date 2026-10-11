/**
 * Secrets Manager secrets (FEAT-01). Created when clouds.aws.features.dbs is
 * enabled.
 *
 * cdktn creates each secret with a dummy value (initialValue). The real
 * value is set from the work VM with the AWS CLI (docs/operations.md,
 * "Secrets"); Terraform ignores later changes of the value.
 */
export const awsSecretsConfig = {
  /** Dummy value stored by cdktn. Kept in the Terraform state. */
  initialValue: "CHANGE_ME",
  /**
   * Days a deleted secret can be restored (0: delete immediately, 7-30).
   * With 7-30, the same name cannot be reused until the period ends.
   */
  recoveryWindowInDays: 0,
  secrets: [
    {
      key: "db-api-password",
      // name: omitted → <PROJECT_NAME>-aws-secret-db-api-password
      description: "Password of the role the API connects as (DB_PASSWORD)",
    },
    {
      key: "db-repl-password",
      description:
        "Password of the role the other databases connect as (logical replication)",
    },
  ] as { key: string; name?: string; description: string }[],
};
