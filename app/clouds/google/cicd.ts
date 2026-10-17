import { cicdTrigger } from "../../config/cicd";
import { isFeatureEnabled } from "../../config/features";
import {
  cloudSqlConfig,
  gcpRunConfigs,
  googleCicdConfigs,
  googlePsaConfig,
} from "../../config/google/googlesettings";
import { createGoogleCicdResources } from "../../constructs/cicd/googlecicd";
import { branchPattern } from "../../utils/branchPattern";
import { GooglePrivateServiceAccess } from "../../constructs/vpcnetwork/googlepsa";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { GoogleBuildContext } from "./context";

/** Cloud Run services deployed by a built GitHub trigger (feature: cicd). */
export function googleCicdDeployTargets(): Set<string> {
  if (!isFeatureEnabled("google", "cicd")) return new Set();
  return new Set(
    googleCicdConfigs
      .filter((c) => c.build && c.githubTrigger?.build)
      .flatMap((c) => c.githubTrigger?.deployTarget?.cloudRunServiceName ?? []),
  );
}

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

        const { githubTrigger } = config;
        const target = githubTrigger.deployTarget;
        if (githubTrigger.build && target) {
          const run = gcpRunConfigs.find((r) => r.build && r.name === target.cloudRunServiceName);
          if (!run || !ctx.cloudRunServices[run.name]) {
            throw new Error(
              `Cloud Build trigger "${githubTrigger.name}" (deployTarget): Cloud Run service ` +
                `"${target.cloudRunServiceName}" not found (or build: false, or containers disabled) ` +
                `in config/google/cloudrun.ts`,
            );
          }
        }

        const cicdRes = createGoogleCicdResources(
          scope,
          googleProvider,
          {
            ...config,
            project: cloudSqlConfig.project,
            githubTrigger: {
              ...githubTrigger,
              branchPattern: branchPattern(cicdTrigger.branches),
              deploy: target
                ? {
                    cloudRunServiceName: target.cloudRunServiceName,
                    location: gcpRunConfigs.find((r) => r.name === target.cloudRunServiceName)!.location,
                    journalPruneJobName: ctx.journalPruneJobs[target.cloudRunServiceName]?.name,
                  }
                : undefined,
            },
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

        if (cicdRes.cloudRunIamMember && target) {
          addTerraformDependency(
            cicdRes.cloudRunIamMember,
            ctx.cloudRunServices[target.cloudRunServiceName],
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
