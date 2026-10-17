import { awsSecretsConfig } from "../../config/aws/awssettings";
import { isFeatureEnabled } from "../../config/features";
import { createAwsSecrets } from "../../constructs/secrets/awssecrets";
import { AwsBuildContext } from "./context";

/** 4.5. Secrets Manager secrets of the databases (feature: dbs) */
export function createAwsSecretResources(ctx: AwsBuildContext): void {
  if (isFeatureEnabled("aws", "dbs")) {
    ctx.dbSecrets = createAwsSecrets(ctx.scope, ctx.awsProvider, awsSecretsConfig);
  }
}
