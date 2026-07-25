/**
 * AWS ECR & CodeBuild Multiple Configurations
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
      repositoryUrl: "https://github.com/Otazoman/cdktn_multicloud_backend.git",
      environmentVariables: [{ name: "ENV_NAME", value: "production" }],
      useExternalBuildspec: true,
      buildspecPath: "./config/aws/cicd/custom_buildspec.yml",
      // IAM role used by this CodeBuild project. Name must match a role
      // name defined in config/aws/iam.ts (iamRolesConfig).
      serviceRoleName: "codebuild-service-role",
      // CloudWatch Log Group used by this CodeBuild project's build logs.
      // Name must match an entry in config/aws/cloudwatchlogs.ts.
      cloudwatchLogGroupName: "/aws/codebuild/api-service-cicd",
    },
    tags: {
      ManagedBy: "CDKTN",
      Project: "API",
    },
  },
];
