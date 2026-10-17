import { ArtifactRegistryRepository } from "@cdktn/provider-google/lib/artifact-registry-repository";
import { ArtifactRegistryRepositoryIamMember } from "@cdktn/provider-google/lib/artifact-registry-repository-iam-member";
import { CloudRunV2ServiceIamMember } from "@cdktn/provider-google/lib/cloud-run-v2-service-iam-member";
import { CloudbuildTrigger } from "@cdktn/provider-google/lib/cloudbuild-trigger";
import { CloudbuildWorkerPool } from "@cdktn/provider-google/lib/cloudbuild-worker-pool";
import { CloudRunV2JobIamMember } from "@cdktn/provider-google/lib/cloud-run-v2-job-iam-member";
import { Cloudbuildv2Repository } from "@cdktn/provider-google/lib/cloudbuildv2-repository";
import { DataGoogleProject } from "@cdktn/provider-google/lib/data-google-project";
import { ProjectIamMember } from "@cdktn/provider-google/lib/project-iam-member";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { ServiceAccount } from "@cdktn/provider-google/lib/service-account";
import { ServiceAccountIamMember } from "@cdktn/provider-google/lib/service-account-iam-member";
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
    /**
     * Construct ID key (Terraform address). Defaults to `workerPoolName`.
     * To rename the resource without replacing it in state, set this to the
     * old value.
     */
    key?: string;
    workerPoolName: string;
    location: string;
    machineType?: string;
    diskSizeGb?: number;
    peeredNetworkIpRange?: string;
  };
  githubTrigger?: {
    /**
     * Construct ID key (Terraform address). Defaults to `name`.
     * To rename the resource without replacing it in state, set this to the
     * old value.
     */
    key?: string;
    build: boolean;
    name: string;
    /**
     * Cloud Build GitHub connection (2nd gen) in the private pool's region,
     * created and approved with gcloud before the deploy.
     */
    connectionName: string;
    /** Name of the repository linked to the connection */
    repositoryName: string;
    /** HTTPS clone URL of the repository */
    remoteUri: string;
    /** Regular expression of the branches whose pushes start the build */
    branchPattern: string;
    /** Build definition in the repository (e.g. cloudbuild.yaml) */
    filename: string;
    /** Account ID of the service account the build runs as */
    serviceAccountId: string;
    /**
     * Cloud Run service the build deploys to (passed as _SERVICE). It must
     * run as the default compute service account.
     */
    deploy?: {
      cloudRunServiceName: string;
      location: string;
      /** Cloud Run job that runs the same image (passed as _PRUNE_JOB) */
      journalPruneJobName?: string;
    };
  };
  tags?: { [key: string]: string };
}

export interface GoogleCicdOutput {
  artifactRegistry: ArtifactRegistryRepository;
  cloudbuildPrivatePool: CloudbuildWorkerPool;
  cloudbuildTrigger?: CloudbuildTrigger;
  /** IAM bindings on the Cloud Run service (depends on the service) */
  cloudRunIamMember?: CloudRunV2ServiceIamMember;
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
    `gcp-cb-pool-${config.cloudbuildPrivatePool.key ?? config.cloudbuildPrivatePool.workerPoolName}`,
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

  // 3. GitHub trigger (2nd gen connection) running as its own service account
  let cloudbuildTrigger: CloudbuildTrigger | undefined = undefined;
  let cloudRunIamMember: CloudRunV2ServiceIamMember | undefined = undefined;
  const trigger = config.githubTrigger;
  if (trigger && trigger.build) {
    const id = trigger.key ?? trigger.name;
    const location = config.cloudbuildPrivatePool.location;

    const serviceAccount = new ServiceAccount(scope, `gcp-cb-sa-${id}`, {
      provider,
      project: config.project,
      accountId: trigger.serviceAccountId,
      displayName: `Cloud Build trigger ${trigger.name}`,
    });
    const member = `serviceAccount:${serviceAccount.email}`;

    // Write build logs and run on the private pool
    const grants: ITerraformDependable[] = [
      "roles/logging.logWriter",
      "roles/cloudbuild.workerPoolUser",
    ].map(
      (role) =>
        new ProjectIamMember(scope, `gcp-cb-sa-${id}-${role.replace(/[^a-zA-Z0-9]/g, "-")}`, {
          provider,
          project: config.project,
          role,
          member,
        }),
    );
    // Push the image
    grants.push(
      new ArtifactRegistryRepositoryIamMember(scope, `gcp-cb-sa-${id}-ar-writer`, {
        provider,
        project: config.project,
        location: config.artifactRegistry.location,
        repository: artifactRegistry.name,
        role: "roles/artifactregistry.writer",
        member,
      }),
    );

    const substitutions: Record<string, string> = {
      _REGION: config.artifactRegistry.location,
      _AR_REPOSITORY: config.artifactRegistry.repositoryId,
      _WORKER_POOL: cloudbuildPrivatePool.id,
    };

    if (trigger.deploy) {
      // Deploy a new revision of the service ...
      cloudRunIamMember = new CloudRunV2ServiceIamMember(scope, `gcp-cb-sa-${id}-run-developer`, {
        provider,
        project: config.project,
        location: trigger.deploy.location,
        name: trigger.deploy.cloudRunServiceName,
        role: "roles/run.developer",
        member,
      });
      grants.push(cloudRunIamMember);
      // ... that runs as the default compute service account
      const project = new DataGoogleProject(scope, `gcp-cb-sa-${id}-project`, {
        provider,
        projectId: config.project,
      });
      grants.push(
        new ServiceAccountIamMember(scope, `gcp-cb-sa-${id}-act-as-compute`, {
          provider,
          serviceAccountId: `projects/${config.project}/serviceAccounts/${project.number}-compute@developer.gserviceaccount.com`,
          role: "roles/iam.serviceAccountUser",
          member,
        }),
      );
      substitutions._SERVICE = trigger.deploy.cloudRunServiceName;
      // ... and updates the image of the job that runs the same image
      if (trigger.deploy.journalPruneJobName) {
        grants.push(
          new CloudRunV2JobIamMember(scope, `gcp-cb-sa-${id}-job-developer`, {
            provider,
            project: config.project,
            location: trigger.deploy.location,
            name: trigger.deploy.journalPruneJobName,
            role: "roles/run.developer",
            member,
          }),
        );
        substitutions._PRUNE_JOB = trigger.deploy.journalPruneJobName;
      }
    }

    const repository = new Cloudbuildv2Repository(scope, `gcp-cb-repo-${id}`, {
      provider,
      project: config.project,
      location,
      parentConnection: `projects/${config.project}/locations/${location}/connections/${trigger.connectionName}`,
      name: trigger.repositoryName,
      remoteUri: trigger.remoteUri,
    });

    cloudbuildTrigger = new CloudbuildTrigger(scope, `gcp-cb-trigger-${id}`, {
      provider: provider,
      project: config.project,
      location,
      name: trigger.name,
      serviceAccount: serviceAccount.id,
      repositoryEventConfig: {
        repository: repository.id,
        push: { branch: trigger.branchPattern },
      },
      filename: trigger.filename,
      substitutions,
      dependsOn: [cloudbuildPrivatePool, ...grants],
    });
  }

  return {
    artifactRegistry,
    cloudbuildPrivatePool,
    cloudbuildTrigger,
    cloudRunIamMember,
  };
}
