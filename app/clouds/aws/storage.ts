import { efsConfigs } from "../../config/aws/awssettings";
import { isFeatureEnabled } from "../../config/features";
import { createAwsEfs } from "../../constructs/storage/awsefs";

import { addTerraformDependency } from "../../utils/terraformDependency";
import { AwsBuildContext } from "./context";

/** 3. EFS (feature: storage) */
export function createAwsStorage(ctx: AwsBuildContext): void {
  const { scope, awsProvider, output, awsVpcResources, getSecurityGroupId } = ctx;

  // ──────────────────────────────────────────────
  // 3. EFS
  // ──────────────────────────────────────────────
  if (isFeatureEnabled("aws", "storage")) {
    const buildableEfsConfigs = efsConfigs.filter((c) => c.build);

    const efsRes = createAwsEfs(scope, awsProvider, {
      efsConfigs: buildableEfsConfigs.map((config) => ({
        ...config,
        securityGroupIds:
          config.securityGroupIds?.map((name) => getSecurityGroupId(name)) ||
          [],
      })),
      subnets: awsVpcResources.subnetsByName,
    });

    efsRes.forEach((res) => {
      addTerraformDependency(res.fileSystem, awsVpcResources);
      res.mountTargets.forEach((t) =>
        addTerraformDependency(t, awsVpcResources),
      );
      res.accessPoints.forEach((ap) =>
        addTerraformDependency(ap, awsVpcResources),
      );
    });

    const efsMeta = efsRes
      .map((res, idx) => {
        const cfg = buildableEfsConfigs[idx];
        if (!cfg.cnameRecordName) return null;
        return {
          cnameRecordName: cfg.cnameRecordName,
          dnsFqdn: res.fileSystem.dnsName,
        };
      })
      .filter(
        (item): item is { cnameRecordName: string; dnsFqdn: string } =>
          item !== null,
      );

    output.efsInstances = efsMeta;
  }

}
