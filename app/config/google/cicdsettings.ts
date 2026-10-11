import { appRepository, appRepositoryUrl } from "../cicd";
import { LOCATION, PROJECT_NAME } from "./common";

/**
 * Artifact Registry, Cloud Build private pool and GitHub trigger.
 *
 * The build definition is cloudbuild.yaml of the application repository
 * (config/cicd.ts). Pushes to the branches of cicdTrigger start the build.
 */
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
    // GitHub trigger (Cloud Build 2nd gen). The connection is created and
    // approved with gcloud before the deploy (docs/getting-started.md).
    githubTrigger: {
      build: true,
      name: "github-push-trigger",
      // Connection in the region of cloudbuildPrivatePool.location
      connectionName: "multicloud-github",
      repositoryName: appRepository.name,
      remoteUri: appRepositoryUrl,
      filename: "cloudbuild.yaml",
      // Service account the build runs as (created by cdktn)
      serviceAccountId: "cloudbuild-deployer",
      // Cloud Run service the build deploys to (name in cloudrun.ts; passed
      // as _SERVICE). Terraform then ignores the service's image. Omit to
      // build and push only (cloudbuild.yaml then fails at its deploy step).
      deployTarget: { cloudRunServiceName: "web-service-with-lb" },
    },
    tags: {
      environment: "dev",
      owner: "team-a",
    },
  },
];
