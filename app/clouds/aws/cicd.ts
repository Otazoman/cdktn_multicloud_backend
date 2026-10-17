import { DataAwsCodestarconnectionsConnection } from "@cdktn/provider-aws/lib/data-aws-codestarconnections-connection";
import { awsCicdConfigs, awsEcsConfigs } from "../../config/aws/awssettings";
import { cicdTrigger } from "../../config/cicd";
import { isFeatureEnabled } from "../../config/features";

import { createAwsCicdResources } from "../../constructs/cicd/awscicd";
import { branchPattern } from "../../utils/branchPattern";
import { idPart } from "../../utils/naming";
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

        // ECS service the build deploys to (buildspec.yml)
        let deploy: { clusterName: string; serviceName: string; containerName: string; taskFamily: string; passRoleArns: string[] } | undefined;
        if (config.deployTarget) {
          const label = `CodeBuild project "${config.name}" (deployTarget)`;
          const ecs = awsEcsConfigs.find(
            (c) => c.build && c.name === config.deployTarget.ecsServiceName,
          );
          if (!ecs) {
            throw new Error(
              `${label}: ECS service "${config.deployTarget.ecsServiceName}" not found ` +
                `(or build: false) in config/aws/ecs.ts`,
            );
          }
          deploy = {
            clusterName: ecs.clusterName,
            serviceName: ecs.name,
            containerName: ecs.containerName,
            // The task definition family is the service name (constructs/container/awsecs.ts)
            taskFamily: ecs.name,
            passRoleArns: [
              getIamRoleArn(ecs.executionRoleName, label),
              getIamRoleArn(ecs.taskRoleName, label),
            ],
          };
        }

        // ARN of the GitHub connection, looked up by name
        const connectionName = config.codebuild.codeConnectionName;
        let connectionArn: string | undefined;
        if (connectionName) {
          connectionArn = new DataAwsCodestarconnectionsConnection(
            scope,
            `codeconnection-${idPart(connectionName)}`,
            { provider: awsProvider, name: connectionName },
          ).arn;
        } else {
          console.warn(
            `⚠️  Warning: codeConnectionName is not set for CodeBuild project "${config.name}"; ` +
              `no webhook is created (config/aws/cicd/cicdsettings.ts).`,
          );
        }

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
              serviceRoleName: config.codebuild.serviceRoleName,
              connectionArn,
              triggerHeadRefPattern: branchPattern(
                cicdTrigger.branches,
                "refs/heads/",
              ),
            },
            deploy,
            tags: config.tags,
          },
          awsVpcResources.vpc.id,
        );

        // Dependency Control for Deploying CI/CD Constructs After the VPC Is Fully Created
        addTerraformDependency(cicdRes.codebuild, awsVpcResources.vpc);
        addTerraformDependency(cicdRes.codebuild, iamResources);
        addTerraformDependency(cicdRes.codebuild, logGroup);
        if (cicdRes.rolePolicy) {
          addTerraformDependency(cicdRes.rolePolicy, iamResources);
        }
      });
  }
}
