import { isFeatureEnabled } from "../../config/features";
import { googleSecretsConfig } from "../../config/google/googlesettings";
import { createGoogleSecrets } from "../../constructs/secrets/googlesecrets";
import { GoogleBuildContext } from "./context";

/** 4.5. Secret Manager secrets of the databases (feature: dbs) */
export function createGoogleSecretResources(ctx: GoogleBuildContext): void {
  if (isFeatureEnabled("google", "dbs")) {
    ctx.dbSecrets = createGoogleSecrets(ctx.scope, ctx.googleProvider, googleSecretsConfig);
  }
}
