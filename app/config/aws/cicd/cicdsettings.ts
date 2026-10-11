import { appRepositoryUrl } from "../../cicd";
import { byEnv } from "../../environment";

/**
 * AWS ECR & CodeBuild Multiple Configurations
 *
 * The build definition is buildspec.yml of the application repository
 * (config/cicd.ts). Pushes to the branches of cicdTrigger start the build
 * through a webhook when codeConnectionName is set.
 */
export const awsCicdConfigs = [
  {
    name: "api-service-cicd",
    build: true,
    ecr: {
      imageRetentionInDays: 30,
      scanOnPush: true,
    },
    codebuild: {
      computeType: "BUILD_GENERAL1_SMALL",
      image: "aws/codebuild/amazonlinux2-x86_64-standard:5.0",
      type: "LINUX_CONTAINER",
      privilegedMode: true,
      securityGroupNames: ["codebuild-sg"],
      subnetNames: [
        "my-aws-vpc-private-subnet1a",
        "my-aws-vpc-private-subnet1c",
        "my-aws-vpc-private-subnet1d",
      ],
      repositoryUrl: appRepositoryUrl,
      // Name of the CodeConnections connection to GitHub, created and
      // approved before the deploy (docs/getting-started.md). Its ARN is
      // looked up by name. Empty: the project is created without a webhook
      // and cannot read the private repository.
      codeConnectionName: byEnv({ default: "multicloud-github" }),
      environmentVariables: [{ name: "ENV_NAME", value: "production" }],
      // IAM role used by this CodeBuild project. Name must match a role
      // name defined in config/aws/iam.ts (iamRolesConfig).
      serviceRoleName: "codebuild-service-role",
      // CloudWatch Log Group used by this CodeBuild project's build logs.
      // Name must match an entry in config/aws/cloudwatchlogs.ts.
      cloudwatchLogGroupName: "/aws/codebuild/api-service-cicd",
    },
    // ECS service the build deploys to (name in ecs.ts). The cluster,
    // service and container names are passed to buildspec.yml, the role gets
    // the deploy permissions. Omit to build and push only.
    deployTarget: { ecsServiceName: "api-service" },
    tags: {
      ManagedBy: "CDKTN",
      Project: "API",
    },
  },
];
