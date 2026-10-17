import { CodebuildProject } from "@cdktn/provider-aws/lib/codebuild-project";
import { CodebuildWebhook } from "@cdktn/provider-aws/lib/codebuild-webhook";
import { EcrLifecyclePolicy } from "@cdktn/provider-aws/lib/ecr-lifecycle-policy";
import { EcrRepository } from "@cdktn/provider-aws/lib/ecr-repository";
import { IamRolePolicy } from "@cdktn/provider-aws/lib/iam-role-policy";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Construct } from "constructs";

export interface CicdConfig {
  /**
   * Construct ID key (Terraform address). Defaults to `name`. To rename
   * the resource without replacing it in state, set this to the old value.
   */
  key?: string;
  name: string;
  ecr: {
    imageRetentionInDays: number;
    scanOnPush: boolean;
    /**
     * Delete the repository together with its images on destroy. Default:
     * true (CI/CD pushes images; a repository with images cannot be deleted).
     */
    forceDelete?: boolean;
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
    /**
     * Name of the service role (serviceRoleArn). Required by
     * connectionArn and deploy: their permissions are added to it.
     */
    serviceRoleName?: string;
    /**
     * ARN of an AVAILABLE CodeConnections connection to GitHub. When set,
     * the source is read through it and a webhook starts the build.
     */
    connectionArn?: string;
    /** HEAD_REF pattern of the webhook (e.g. "^refs/heads/(main)$") */
    triggerHeadRefPattern?: string;
  };
  /** ECS service the build deploys to (buildspec.yml of the application) */
  deploy?: {
    clusterName: string;
    serviceName: string;
    containerName: string;
    /** Task definition family; buildspec.yml builds on its latest revision */
    taskFamily: string;
    /** Task execution / task roles passed to ECS with the new revision */
    passRoleArns: string[];
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
  const repository = new EcrRepository(scope, `ecr-${config.key ?? config.name}`, {
    provider,
    name: config.name,
    forceDelete: config.ecr.forceDelete ?? true,
    imageScanningConfiguration: {
      scanOnPush: config.ecr.scanOnPush,
    },
    tags: config.tags,
  });

  // ECR Lifecycle Policy (Automatic Deletion of Old Images)
  new EcrLifecyclePolicy(scope, `ecr-policy-${config.key ?? config.name}`, {
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

  // Deploy target read by buildspec.yml of the application
  if (config.deploy) {
    envVars.push(
      { name: "ECS_CLUSTER", value: config.deploy.clusterName, type: "PLAINTEXT" },
      { name: "ECS_SERVICE", value: config.deploy.serviceName, type: "PLAINTEXT" },
      { name: "CONTAINER_NAME", value: config.deploy.containerName, type: "PLAINTEXT" },
      { name: "TASK_FAMILY", value: config.deploy.taskFamily, type: "PLAINTEXT" },
    );
  }

  // 3. CodeBuild Project
  const codebuild = new CodebuildProject(scope, `codebuild-${config.key ?? config.name}`, {
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
      auth: config.codebuild.connectionArn
        ? { type: "CODECONNECTIONS", resource: config.codebuild.connectionArn }
        : undefined,
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

  // 4. Permissions of the service role for the connection and the deploy
  const statements: Record<string, unknown>[] = [];
  if (config.codebuild.connectionArn) {
    statements.push({
      Effect: "Allow",
      Action: [
        "codeconnections:GetConnection",
        "codeconnections:GetConnectionToken",
        "codeconnections:UseConnection",
      ],
      Resource: [config.codebuild.connectionArn],
    });
  }
  if (config.deploy) {
    const { clusterName, serviceName, passRoleArns } = config.deploy;
    statements.push(
      {
        Effect: "Allow",
        Action: ["ecs:DescribeServices", "ecs:UpdateService"],
        Resource: [`arn:aws:ecs:*:*:service/${clusterName}/${serviceName}`],
      },
      {
        // Task definitions cannot be restricted by resource
        Effect: "Allow",
        Action: ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"],
        Resource: ["*"],
      },
      {
        Effect: "Allow",
        Action: ["iam:PassRole"],
        Resource: passRoleArns,
        Condition: {
          StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" },
        },
      },
    );
  }
  let rolePolicy: IamRolePolicy | undefined;
  if (statements.length > 0) {
    if (!config.codebuild.serviceRoleName) {
      throw new Error(
        `CodeBuild project "${config.name}": serviceRoleName is required for the connection / deploy permissions`,
      );
    }
    rolePolicy = new IamRolePolicy(scope, `codebuild-policy-${config.key ?? config.name}`, {
      provider,
      name: `${config.name}-deploy`,
      role: config.codebuild.serviceRoleName,
      policy: JSON.stringify({ Version: "2012-10-17", Statement: statements }),
    });
  }

  // 5. Webhook: pushes to the trigger branches start the build
  let webhook: CodebuildWebhook | undefined;
  if (config.codebuild.connectionArn && config.codebuild.triggerHeadRefPattern) {
    webhook = new CodebuildWebhook(scope, `codebuild-webhook-${config.key ?? config.name}`, {
      provider,
      projectName: codebuild.name,
      buildType: "BUILD",
      filterGroup: [
        {
          filter: [
            { type: "EVENT", pattern: "PUSH" },
            { type: "HEAD_REF", pattern: config.codebuild.triggerHeadRefPattern },
          ],
        },
      ],
      // The source must be readable through the connection first
      dependsOn: rolePolicy ? [rolePolicy] : undefined,
    });
  }

  return { repository, codebuild, rolePolicy, webhook };
}
