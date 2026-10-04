import { isFeatureEnabled } from "../../config/features";
import {
  cloudSqlConfig,
  googlePsaConfig,
} from "../../config/google/googlesettings";
import {
  CloudSqlConfig,
  createGoogleCloudSqlInstance,
} from "../../constructs/relationaldatabase/googlecloudsql";
import { GooglePrivateServiceAccess } from "../../constructs/vpcnetwork/googlepsa";
import { GoogleResourcesOutput } from "./types";
import { GoogleBuildContext } from "./context";

/** 4. Cloud SQL, Private Service Access shared with Filestore (feature: dbs) */
export function createGoogleDatabases(ctx: GoogleBuildContext): void {
  const { scope, googleProvider, output, googleVpcResources } = ctx;

  // ──────────────────────────────────────────────
  // 4. Cloud SQL  (PSA shared with Filestore)
  // ──────────────────────────────────────────────
  const cloudSqlInstances: GoogleResourcesOutput["cloudSqlInstances"] = [];

  if (isFeatureEnabled("google", "dbs")) {
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

    // Expose PSA deps if not already set by Filestore block above
    if (!ctx.psaDependencies) {
      ctx.psaDependencies = [psa.connection, psa.peeringRoutesConfig];
      output.psaDependencies = ctx.psaDependencies;
    }

    const buildableInstances = cloudSqlConfig.instances.filter((c) => c.build);

    buildableInstances.forEach((instanceConfig) => {
      const config: CloudSqlConfig = {
        ...instanceConfig,
        project: cloudSqlConfig.project,
      };

      const sqlRes = createGoogleCloudSqlInstance(
        scope,
        googleProvider,
        config,
        googleVpcResources.vpc,
        [psa.connection, psa.peeringRoutesConfig],
        instanceConfig.name,
      );

      cloudSqlInstances.push({
        name: sqlRes.sqlInstance.name,
        privateIpAddress: sqlRes.sqlInstance.privateIpAddress,
        connectionName: sqlRes.connectionName,
        aRecordName: instanceConfig.aRecordName,
      });
    });

    output.cloudSqlInstances = cloudSqlInstances;
  }

}
