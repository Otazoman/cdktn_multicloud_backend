import { awsCicdConfigs } from "../../config/aws/awssettings";
import { isFeatureEnabled } from "../../config/features";

import { createAwsCicdResources } from "../../constructs/cicd/awscicd";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { AwsBuildContext } from "./context";

/** 8. ECR + CodeBuild (feature: cicd) */
export function createAwsCicd(ctx: AwsBuildContext): void {
  const { scope, awsProvider, awsVpcResources, iamResources, getSecurityGroupId, getIamRoleArn, getLogGroup } = ctx;

  // ──────────────────────────────────────────────
  // 8. ECR + CodeBuild (VPC-compatible)
  // ──────────────────────────────────────────────
  if (isFeatureEnabled("aws", "cicd") && awsCicdConfigs) {
    awsCicdConfigs
      .filter((c) => c.build)
      .forEach((config) => {
        let loadedBuildspec: string | undefined = undefined;

        // Resolve IAM role and CloudWatch Log Group directly from the
        // names configured in cicdsettings.ts, instead of hardcoded names.
        const serviceRoleArn = getIamRoleArn(
          config.codebuild.serviceRoleName,
          `CodeBuild project "${config.name}" (serviceRoleName)`,
        );
        const logGroupName = config.codebuild
          .cloudwatchLogGroupName as string;
        const logGroup = getLogGroup(
          logGroupName,
          `CodeBuild project "${config.name}" (cloudwatchLogGroupName)`,
        );

        const cicdRes = createAwsCicdResources(
          scope,
          awsProvider,
          {
            name: config.name,
            ecr: config.ecr,
            codebuild: {
              computeType: config.codebuild.computeType,
              image: config.codebuild.image,
              type: config.codebuild.type,
              privilegedMode: config.codebuild.privilegedMode,
              // Safely Convert to Security Group ID
              securityGroupIds: config.codebuild.securityGroupNames.map(
                (name) => getSecurityGroupId(name),
              ),
              // Convert to Subnet ID Safely
              subnetIds: config.codebuild.subnetNames.map((name) => {
                const subnet = awsVpcResources.subnetsByName[name];
                if (!subnet)
                  throw new Error(`Subnet ${name} not found for CodeBuild`);
                return subnet.id;
              }),
              repositoryUrl: config.codebuild.repositoryUrl,
              environmentVariables: config.codebuild.environmentVariables,
              buildspec: loadedBuildspec,
              // IAM role resolved from cicdsettings.ts above
              serviceRoleArn,
              // CloudWatch Log Group resolved from cicdsettings.ts above
              cloudwatchLogGroupName: logGroupName,
            },
            tags: config.tags,
          },
          awsVpcResources.vpc.id,
        );

        // Dependency Control for Deploying CI/CD Constructs After the VPC Is Fully Created
        addTerraformDependency(cicdRes.codebuild, awsVpcResources.vpc);
        addTerraformDependency(cicdRes.codebuild, iamResources);
        addTerraformDependency(cicdRes.codebuild, logGroup);
      });
  }
}
