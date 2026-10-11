import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { SecretManagerSecret } from "@cdktn/provider-google/lib/secret-manager-secret";
import { SecretManagerSecretVersion } from "@cdktn/provider-google/lib/secret-manager-secret-version";
import { Construct } from "constructs";
import { resourceName } from "../../utils/naming";

export interface GoogleSecretsConfig {
  project: string;
  /** Dummy first version stored by cdktn (the real value is added with gcloud) */
  initialValue: string;
  secrets: { key: string; name?: string; description: string }[];
}

/**
 * Creates Secret Manager secrets with a dummy first version. The real value
 * is added as a new version outside cdktn, which Terraform does not track.
 */
export function createGoogleSecrets(
  scope: Construct,
  provider: GoogleProvider,
  config: GoogleSecretsConfig,
): Map<string, SecretManagerSecret> {
  const secrets = new Map<string, SecretManagerSecret>();
  for (const secretConfig of config.secrets) {
    const secret = new SecretManagerSecret(
      scope,
      `google-secret-${secretConfig.key}`,
      {
        provider,
        project: config.project,
        secretId: resourceName(
          secretConfig.name,
          "google",
          "secret",
          secretConfig.key,
        ),
        labels: { purpose: "feat01" },
        annotations: { description: secretConfig.description },
        replication: { auto: {} },
      },
    );
    new SecretManagerSecretVersion(scope, `google-secret-version-${secretConfig.key}`, {
      provider,
      secret: secret.id,
      secretData: config.initialValue,
    });
    secrets.set(secretConfig.key, secret);
  }
  return secrets;
}
