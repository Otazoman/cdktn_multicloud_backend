import { ec2Configs } from "../../config/aws/awssettings";
import { isFeatureEnabled } from "../../config/features";
import { createAwsEc2Instances } from "../../constructs/vmresources/awsec2";

import { addTerraformDependency } from "../../utils/terraformDependency";
import { AwsBuildContext } from "./context";

/** 5. EC2 (feature: vms) */
export function createAwsVms(ctx: AwsBuildContext): void {
  const { scope, awsProvider, awsVpcResources, getSecurityGroupId } = ctx;

  // ──────────────────────────────────────────────
  // 5. EC2
  // ──────────────────────────────────────────────
  if (isFeatureEnabled("aws", "vms")) {
    const awsEc2Instances = createAwsEc2Instances(scope, awsProvider, {
      instanceConfigs: ec2Configs.map((config) => {
        const { securityGroupIds, ...restConfig } = config;
        return {
          ...restConfig,
          securityGroupIds: securityGroupIds
            .map((name) => getSecurityGroupId(name))
            .filter((id): id is string => !!id),
          subnetKey: config.subnetKey,
        };
      }),
      subnets: awsVpcResources.subnetsByName,
    });

    awsEc2Instances.forEach((instance) =>
      addTerraformDependency(instance, awsVpcResources),
    );
  }

}
