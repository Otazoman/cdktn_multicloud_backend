import { CloudRunService } from "@cdktn/provider-google/lib/cloud-run-service";
import { CloudRunServiceIamMember } from "@cdktn/provider-google/lib/cloud-run-service-iam-member";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";

/**
 * Cloud Run Container Configuration
 */
export interface CloudRunContainerConfig {
  image: string;
  port: number;
  environment?: { name: string; value: string }[];
  cpu?: string; // e.g., "1000m"
  memory?: string; // e.g., "512Mi"
}

/**
 * Cloud Run Service Configuration
 */
export interface CloudRunConfig {
  name: string;
  location: string;
  project: string;
  container: CloudRunContainerConfig;
  allowUnauthenticated?: boolean;
  minInstances?: number;
  maxInstances?: number;
  tags?: { [key: string]: string };
}

export function createGoogleCloudRunResources(
  scope: Construct,
  provider: GoogleProvider,
  config: CloudRunConfig,
) {
  // 1. Cloud Run Service
  const service = new CloudRunService(scope, `run-${config.name}`, {
    provider,
    name: config.name,
    location: config.location,
    project: config.project,

    template: {
      spec: {
        containers: [
          {
            image: config.container.image,
            ports: [{ containerPort: config.container.port }],
            env: config.container.environment,
            resources: {
              limits: {
                cpu: config.container.cpu || "1000m",
                memory: config.container.memory || "512Mi",
              },
            },
          },
        ],
        containerConcurrency: 80,
      },
      metadata: {
        annotations: {
          "autoscaling.knative.dev/minScale": (
            config.minInstances ?? 0
          ).toString(),
          "autoscaling.knative.dev/maxScale": (
            config.maxInstances ?? 10
          ).toString(),
        },
      },
    },

    traffic: [
      {
        percent: 100,
        latestRevision: true,
      },
    ],
  });

  // 2. IAM Policy: Allow Unauthenticated Access (Public access)
  if (config.allowUnauthenticated) {
    const iamMember = new CloudRunServiceIamMember(
      scope,
      `allow-unauth-${config.name}`,
      {
        provider,
        project: config.project,
        location: config.location,
        service: service.name,
        role: "roles/run.invoker",
        member: "allUsers",
      },
    );
    iamMember.node.addDependency(service);
  }

  return { service };
}
