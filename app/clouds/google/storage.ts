import { isFeatureEnabled } from "../../config/features";
import {
  filestoreConfigs,
  googlePsaConfig,
} from "../../config/google/googlesettings";
import { createGoogleFilestoreInstances } from "../../constructs/storage/googlefilestore";
import { GooglePrivateServiceAccess } from "../../constructs/vpcnetwork/googlepsa";
import { GoogleResourcesOutput } from "./types";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { GoogleBuildContext } from "./context";

/** 3. Filestore, Private Service Access shared with Cloud SQL (feature: storage) */
export function createGoogleStorage(ctx: GoogleBuildContext): void {
  const { scope, googleProvider, output, googleVpcResources } = ctx;

  // ──────────────────────────────────────────────
  // 3. Filestore  (PSA shared with CloudSQL)
  // ──────────────────────────────────────────────
  const filestoreInstances: GoogleResourcesOutput["filestoreInstances"] = [];

  if (isFeatureEnabled("google", "storage")) {
    const psa = GooglePrivateServiceAccess.getOrCreate(
      scope,
      googlePsaConfig.psaConstructId,
      googleProvider,
      {
        project: filestoreConfigs.project,
        vpcId: googleVpcResources.vpc.id,
        vpcName: googleVpcResources.vpc.name,
        isExisting: googlePsaConfig.isExisting,
        serviceRanges: googlePsaConfig.serviceRanges,
      },
    );

    ctx.psaDependencies = [psa.connection, psa.peeringRoutesConfig];

    const buildableInstances = filestoreConfigs.instances.filter(
      (c) => c.build,
    );

    const filestoreRes = createGoogleFilestoreInstances(
      scope,
      googleProvider,
      {
        project: filestoreConfigs.project,
        filestoreConfigs: buildableInstances,
        psaDependencies: [psa.connection, psa.peeringRoutesConfig],
      },
      googleVpcResources.vpc,
      googleVpcResources.subnets,
    );

    filestoreRes.forEach((res) => {
      addTerraformDependency(res.instance, googleVpcResources.vpc);
    });

    const filestoreMeta = filestoreRes
      .map((res, idx) => {
        const cfg = buildableInstances[idx];
        if (!cfg.aRecordName) return null;
        return {
          aRecordName: cfg.aRecordName,
          privateIpAddress: res.instance.networks.get(0).ipAddresses[0],
        };
      })
      .filter(
        (item): item is { aRecordName: string; privateIpAddress: string } =>
          item !== null,
      );

    filestoreInstances.push(...filestoreMeta);
    output.filestoreInstances = filestoreMeta;
    output.psaDependencies = ctx.psaDependencies;
  }

}
