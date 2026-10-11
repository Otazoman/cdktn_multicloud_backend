import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { SecretsmanagerSecret } from "@cdktn/provider-aws/lib/secretsmanager-secret";
import { SecretsmanagerSecretVersion } from "@cdktn/provider-aws/lib/secretsmanager-secret-version";
import { Construct } from "constructs";
import { resourceName } from "../../utils/naming";

export interface AwsSecretsConfig {
  /** Dummy value stored by cdktn (the real value is set with the AWS CLI) */
  initialValue: string;
  recoveryWindowInDays: number;
  secrets: { key: string; name?: string; description: string }[];
}

/**
 * Creates Secrets Manager secrets with a dummy first value. Terraform ignores
 * later changes of the value, which are made outside cdktn.
 */
export function createAwsSecrets(
  scope: Construct,
  provider: AwsProvider,
  config: AwsSecretsConfig,
): Map<string, SecretsmanagerSecret> {
  const secrets = new Map<string, SecretsmanagerSecret>();
  for (const secretConfig of config.secrets) {
    const secret = new SecretsmanagerSecret(
      scope,
      `aws-secret-${secretConfig.key}`,
      {
        provider,
        name: resourceName(secretConfig.name, "aws", "secret", secretConfig.key),
        description: secretConfig.description,
        recoveryWindowInDays: config.recoveryWindowInDays,
      },
    );
    const version = new SecretsmanagerSecretVersion(
      scope,
      `aws-secret-version-${secretConfig.key}`,
      {
        provider,
        secretId: secret.id,
        secretString: config.initialValue,
      },
    );
    version.addOverride("lifecycle", { ignore_changes: ["secret_string"] });
    secrets.set(secretConfig.key, secret);
  }
  return secrets;
}
