import { CodebuildProject } from "@cdktn/provider-aws/lib/codebuild-project";
import { EcrLifecyclePolicy } from "@cdktn/provider-aws/lib/ecr-lifecycle-policy";
import { EcrRepository } from "@cdktn/provider-aws/lib/ecr-repository";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Construct } from "constructs";

export interface CicdConfig {
  name: string;
  ecr: {
    imageRetentionInDays: number;
    scanOnPush: boolean;
  };
  codebuild: {
    computeType: string;
    image: string;
    type: string;
    privilegedMode: boolean;
    securityGroupIds: string[];
    subnetIds: string[];
    repositoryUrl: string;
    environmentVariables?: { name: string; value: string }[];
    buildspec?: string;
    // IAM Role ARN created externally
    serviceRoleArn: string;
    // CloudWatch Log Group Name created externally (optional)
    cloudwatchLogGroupName?: string;
  };
  tags?: { [key: string]: string };
}

export function createAwsCicdResources(
  scope: Construct,
  provider: AwsProvider,
  config: CicdConfig,
  vpcId: string,
) {
  // 1. ECR Repository
  const repository = new EcrRepository(scope, `ecr-${config.name}`, {
    provider,
    name: config.name,
    imageScanningConfiguration: {
      scanOnPush: config.ecr.scanOnPush,
    },
    tags: config.tags,
  });

  // ECR Lifecycle Policy (Automatic Deletion of Old Images)
  new EcrLifecyclePolicy(scope, `ecr-policy-${config.name}`, {
    provider,
    repository: repository.name,
    policy: JSON.stringify({
      rules: [
        {
          rulePriority: 1,
          description: `Expire images older than ${config.ecr.imageRetentionInDays} days`,
          selection: {
            tagStatus: "any",
            countType: "sinceImagePushed",
            countUnit: "days",
            countNumber: config.ecr.imageRetentionInDays,
          },
          action: {
            type: "expire",
          },
        },
      ],
    }),
  });

  // 2. CodeBuild Project Environment Variables
  const envVars =
    config.codebuild.environmentVariables?.map((v) => ({
      name: v.name,
      value: v.value,
      type: "PLAINTEXT",
    })) || [];

  // Add the ECR repository URL to the environment variables by default
  envVars.push({
    name: "REPOSITORY_URI",
    value: repository.repositoryUrl,
    type: "PLAINTEXT",
  });

  // 3. CodeBuild Project
  const codebuild = new CodebuildProject(scope, `codebuild-${config.name}`, {
    provider,
    name: config.name,
    // Use the IAM Role ARN supplied from the external module
    serviceRole: config.codebuild.serviceRoleArn,
    artifacts: {
      type: "NO_ARTIFACTS",
    },
    environment: {
      computeType: config.codebuild.computeType,
      image: config.codebuild.image,
      type: config.codebuild.type,
      privilegedMode: config.codebuild.privilegedMode,
      environmentVariable: envVars,
    },
    source: {
      type: "GITHUB",
      location: config.codebuild.repositoryUrl,
      buildspec: config.codebuild.buildspec,
    },
    vpcConfig: {
      vpcId: vpcId,
      subnets: config.codebuild.subnetIds,
      securityGroupIds: config.codebuild.securityGroupIds,
    },
    // Configuration to control CloudWatch Logs destination
    logsConfig: {
      cloudwatchLogs: {
        status: "ENABLED",
        // Assign external log group if provided; otherwise CodeBuild defaults to auto-generation
        groupName: config.codebuild.cloudwatchLogGroupName,
      },
    },
    tags: config.tags,
  });

  return { repository, codebuild };
}
