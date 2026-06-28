import { ArtifactRegistryRepository } from "@cdktn/provider-google/lib/artifact-registry-repository";
import { CloudbuildTrigger } from "@cdktn/provider-google/lib/cloudbuild-trigger";
import { CloudbuildWorkerPool } from "@cdktn/provider-google/lib/cloudbuild-worker-pool";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { ITerraformDependable } from "cdktn";
import { Construct } from "constructs";

export interface GoogleCicdConfig {
  name: string;
  project: string;
  artifactRegistry: {
    repositoryId: string;
    location: string;
    format: string;
    description?: string;
  };
  cloudbuildPrivatePool: {
    workerPoolName: string;
    location: string;
    machineType?: string;
    diskSizeGb?: number;
    peeredNetworkIpRange?: string;
  };
  githubTrigger?: {
    build: boolean;
    name: string;
    owner: string;
    repoName: string;
    branchPattern: string;
    filename: string;
  };
  tags?: { [key: string]: string };
}

export interface GoogleCicdOutput {
  artifactRegistry: ArtifactRegistryRepository;
  cloudbuildPrivatePool: CloudbuildWorkerPool;
  cloudbuildTrigger?: CloudbuildTrigger;
}

/**
 * Creates Artifact Registry and Cloud Build Private Pool for secure VPC internal communication.
 */
export function createGoogleCicdResources(
  scope: Construct,
  provider: GoogleProvider,
  config: GoogleCicdConfig,
  vpcId: string,
  psaDependencies: ITerraformDependable[],
): GoogleCicdOutput {
  // 1. Create Artifact Registry Repository (Equivalent to AWS ECR)
  const artifactRegistry = new ArtifactRegistryRepository(
    scope,
    `gcp-ar-repo-${config.artifactRegistry.repositoryId}`,
    {
      provider: provider,
      project: config.project,
      location: config.artifactRegistry.location,
      repositoryId: config.artifactRegistry.repositoryId,
      format: config.artifactRegistry.format,
      description: config.artifactRegistry.description,
      labels: config.tags,
    },
  );

  // 2. Create Cloud Build Private Pool (Equivalent to AWS CodeBuild in VPC)
  const cloudbuildPrivatePool = new CloudbuildWorkerPool(
    scope,
    `gcp-cb-pool-${config.cloudbuildPrivatePool.workerPoolName}`,
    {
      provider: provider,
      project: config.project,
      location: config.cloudbuildPrivatePool.location,
      name: config.cloudbuildPrivatePool.workerPoolName,
      networkConfig: {
        peeredNetwork: vpcId,
        peeredNetworkIpRange:
          config.cloudbuildPrivatePool.peeredNetworkIpRange || undefined,
      },
      workerConfig: {
        machineType:
          config.cloudbuildPrivatePool.machineType || "e2-standard-2",
        diskSizeGb: config.cloudbuildPrivatePool.diskSizeGb || 100,
      },
      // Private pool connection depends entirely on VPC Private Service Access (PSA) configuration
      dependsOn: [...psaDependencies],
      lifecycle: {
        createBeforeDestroy: true,
      },
    },
  );

  // 3. Create Cloud Build GitHub Trigger linked to the Private Pool
  let cloudbuildTrigger: CloudbuildTrigger | undefined = undefined;
  if (config.githubTrigger && config.githubTrigger.build) {
    cloudbuildTrigger = new CloudbuildTrigger(
      scope,
      `gcp-cb-trigger-${config.githubTrigger.name}`,
      {
        provider: provider,
        project: config.project,
        name: config.githubTrigger.name,
        github: {
          owner: config.githubTrigger.owner,
          name: config.githubTrigger.repoName,
          push: {
            branch: config.githubTrigger.branchPattern,
          },
        },
        filename: config.githubTrigger.filename,
        dependsOn: [cloudbuildPrivatePool],
      },
    );
  }

  return {
    artifactRegistry,
    cloudbuildPrivatePool,
    cloudbuildTrigger,
  };
}
