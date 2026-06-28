import { CodebuildProject } from "@cdktn/provider-aws/lib/codebuild-project";
import { EcrLifecyclePolicy } from "@cdktn/provider-aws/lib/ecr-lifecycle-policy";
import { EcrRepository } from "@cdktn/provider-aws/lib/ecr-repository";
import { IamPolicy } from "@cdktn/provider-aws/lib/iam-policy";
import { IamRole } from "@cdktn/provider-aws/lib/iam-role";
import { IamRolePolicyAttachment } from "@cdktn/provider-aws/lib/iam-role-policy-attachment";
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

  // 2. CodeBuild IAM Role
  const buildRole = new IamRole(scope, `codebuild-role-${config.name}`, {
    provider,
    name: `codebuild-${config.name}-role`,
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "codebuild.amazonaws.com" },
        },
      ],
    }),
  });

  // Attaching the standard policies required for operation within the VPC
  new IamRolePolicyAttachment(scope, `codebuild-vpc-policy-${config.name}`, {
    provider,
    role: buildRole.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonVPCFullAccess",
  });

  // Custom inline policy that allows CodeBuild to perform ECR operations and write to CloudWatch Logs
  const customPolicy = new IamPolicy(
    scope,
    `codebuild-custom-policy-${config.name}`,
    {
      provider,
      name: `codebuild-${config.name}-custom-policy`,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "ecr:GetAuthorizationToken",
              "ecr:BatchCheckLayerAvailability",
              "ecr:GetDownloadUrlForLayer",
              "ecr:BatchGetImage",
              "ecr:PutImage",
              "ecr:InitiateLayerUpload",
              "ecr:UploadLayerPart",
              "ecr:CompleteLayerUpload",
            ],
            Resource: "*",
          },
          {
            Effect: "Allow",
            Action: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
            ],
            Resource: "*",
          },
        ],
      }),
    },
  );

  new IamRolePolicyAttachment(scope, `codebuild-custom-attach-${config.name}`, {
    provider,
    role: buildRole.name,
    policyArn: customPolicy.arn,
  });

  // 3. CodeBuild Project
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

  const codebuild = new CodebuildProject(scope, `codebuild-${config.name}`, {
    provider,
    name: config.name,
    serviceRole: buildRole.arn,
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
      type: "GITHUB", // Can be changed to “GITHUB,” “CODEPIPELINE,” etc., depending on the use case, such as for pipeline integration
      location: config.codebuild.repositoryUrl,

      // Instead of the string “buildspec.yml,” we will directly inject the minimal build definition—which AWS recognizes as 100% “valid YAML”—
      // as text from the CDKTF side.
      buildspec: config.codebuild.buildspec,
    },
    vpcConfig: {
      vpcId: vpcId,
      subnets: config.codebuild.subnetIds,
      securityGroupIds: config.codebuild.securityGroupIds,
    },
    tags: config.tags,
  });

  return { repository, codebuild };
}
