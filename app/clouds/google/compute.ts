import { isFeatureEnabled } from "../../config/features";
import { gceInstancesParams } from "../../config/google/googlesettings";
import { createGoogleGceInstances } from "../../constructs/vmresources/googlegce";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { GoogleBuildContext } from "./context";

/** 5. GCE (feature: vms) */
export function createGoogleVms(ctx: GoogleBuildContext): void {
  const { scope, googleProvider, googleVpcResources } = ctx;

  // ──────────────────────────────────────────────
  // 5. GCE
  // ──────────────────────────────────────────────
  if (isFeatureEnabled("google", "vms")) {
    const googleGceInstances = createGoogleGceInstances(
      scope,
      googleProvider,
      {
        ...gceInstancesParams,
        // GCE must wait for PSA peering routes to be fully applied before VM
        // placement so that the VPC routing table is stable.
        psaDependencies: ctx.psaDependencies,
      },
      googleVpcResources.vpc,
      googleVpcResources.subnets,
    );

    googleGceInstances.forEach((instance) => {
      addTerraformDependency(instance, googleVpcResources.vpc);
    });
  }

}
