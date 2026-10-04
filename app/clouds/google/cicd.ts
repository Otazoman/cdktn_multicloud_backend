import { isFeatureEnabled } from "../../config/features";
import {
  cloudSqlConfig,
  googleCicdConfigs,
  googlePsaConfig,
} from "../../config/google/googlesettings";
import { createGoogleCicdResources } from "../../constructs/cicd/googlecicd";
import { GooglePrivateServiceAccess } from "../../constructs/vpcnetwork/googlepsa";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { GoogleBuildContext } from "./context";

/** 8. Artifact Registry + Cloud Build (feature: cicd) */
export function createGoogleCicd(ctx: GoogleBuildContext): void {
  const { scope, googleProvider, output, googleVpcResources } = ctx;

  // ──────────────────────────────────────────────
  // 8. Artifact Registry + Cloud Build (VPC-compatible)
  // ──────────────────────────────────────────────
  if (isFeatureEnabled("google", "cicd") && googleCicdConfigs) {
    googleCicdConfigs
      .filter((c) => c.build)
      .forEach((config) => {
        const psa = GooglePrivateServiceAccess.getOrCreate(
          scope,
          googlePsaConfig.psaConstructId,
          googleProvider,
          {
            project: cloudSqlConfig.project,
            vpcId: googleVpcResources.vpc.id,
            vpcName: googleVpcResources.vpc.name,
            isExisting: googlePsaConfig.isExisting,
            serviceRanges: googlePsaConfig.serviceRanges,
          },
        );

        if (!ctx.psaDependencies) {
          ctx.psaDependencies = [psa.connection, psa.peeringRoutesConfig];
          output.psaDependencies = ctx.psaDependencies;
        }

        const cicdRes = createGoogleCicdResources(
          scope,
          googleProvider,
          {
            ...config,
            project: cloudSqlConfig.project,
          },
          googleVpcResources.vpc.id,
          [psa.connection, psa.peeringRoutesConfig],
        );

        // Trigger
        if (cicdRes.cloudbuildTrigger) {
          addTerraformDependency(
            cicdRes.cloudbuildTrigger,
            googleVpcResources.vpc,
          );
        }

        // Private Pool
        addTerraformDependency(
          cicdRes.cloudbuildPrivatePool,
          googleVpcResources.vpc,
        );
      });
  }

}
