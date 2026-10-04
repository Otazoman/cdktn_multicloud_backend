import { LOCATION, PROJECT_NAME } from "./common";

export const googleCicdConfigs = [
  {
    build: true,
    project: PROJECT_NAME,
    name: "main-app-cicd-pipeline",
    // Artifact Registry Configuration (Equivalent to AWS ECR)
    artifactRegistry: {
      repositoryId: "main-app-repository",
      location: LOCATION,
      format: "DOCKER",
      description: "Main application docker repository for private pipeline",
    },
    // Cloud Build Private Pool Configuration (Equivalent to AWS VPC-connected CodeBuild)
    cloudbuildPrivatePool: {
      workerPoolName: "main-private-worker-pool",
      location: LOCATION,
      machineType: "e2-standard-2",
      diskSizeGb: 100,
      peeredNetworkIpRange: "",
    },
    // GitHub Event Trigger Configuration
    githubTrigger: {
      build: false,
      name: "github-push-trigger",
      owner: "your-github-organization-or-user",
      repoName: "your-repository-name",
      branchPattern: "^main$",
      filename: "cloudbuild.yaml",
    },
    tags: {
      environment: "dev",
      owner: "team-a",
    },
  },
];
