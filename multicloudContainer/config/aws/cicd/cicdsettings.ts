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
    },
    tags: {
      ManagedBy: "CDKTN",
      Project: "API",
    },
  },
];
