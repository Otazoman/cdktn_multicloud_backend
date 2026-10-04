import { CloudRunV2Service } from "@cdktn/provider-google/lib/cloud-run-v2-service";
import { CloudRunV2ServiceIamMember } from "@cdktn/provider-google/lib/cloud-run-v2-service-iam-member";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import { addTerraformDependency } from "../../utils/terraformDependency";

/**
 * Cloud Run Container Configuration
 */
export interface CloudRunContainerConfig {
  image: string;
  port: number;
  environment?: { name: string; value: string }[];
  cpu?: string;
  memory?: string;
}

/**
 * Cloud Run Service Configuration
 */
export interface CloudRunConfig {
  /**
   * Construct ID key (Terraform address). Defaults to `name`. To rename
   * the resource without replacing it in state, set this to the old value.
   */
  key?: string;
  name: string;
  location: string;
  project: string;
  container: CloudRunContainerConfig;
  allowUnauthenticated?: boolean;
  minInstances?: number;
  maxInstances?: number;
  useLb?: boolean;
  cpuAlwaysAllocated?: boolean;
  vpcSubnetId?: string;
  networkId?: string;
}

export function createGoogleCloudRunResources(
  scope: Construct,
  provider: GoogleProvider,
  config: CloudRunConfig,
) {
  const ingressSetting = config.useLb
    ? "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
    : "INGRESS_TRAFFIC_ALL";

  const service = new CloudRunV2Service(scope, `run-${config.key ?? config.name}`, {
    provider,
    name: config.name,
    location: config.location,
    project: config.project,
    ingress: ingressSetting,
    deletionProtection: false, // Optional: Set to true if you want to prevent accidental deletion

    template: {
      // Direct VPC Access
      vpcAccess: config.vpcSubnetId
        ? {
            egress: "ALL_TRAFFIC",
            networkInterfaces: [
              {
                network: config.networkId,
                subnetwork: config.vpcSubnetId,
              },
            ],
          }
        : undefined,
      scaling: {
        minInstanceCount: config.minInstances ?? 0,
        maxInstanceCount: config.maxInstances ?? 3,
      },
      containers: [
        {
          image: config.container.image,
          ports: {
            containerPort: config.container.port,
          },
          env: config.container.environment?.map((e) => ({
            name: e.name,
            value: e.value,
          })),
          resources: {
            limits: {
              cpu: config.container.cpu || "0.5",
              memory: config.container.memory || "256Mi",
            },
            cpuIdle:
              config.cpuAlwaysAllocated !== undefined
                ? !config.cpuAlwaysAllocated
                : true,
          },
        },
      ],
    },
  });

  // 2. IAM Policy for Public Access
  if (config.allowUnauthenticated) {
    const iamMember = new CloudRunV2ServiceIamMember(
      scope,
      `allow-unauth-${config.key ?? config.name}`,
      {
        provider,
        project: config.project,
        location: config.location,
        name: service.name,
        role: "roles/run.invoker",
        member: "allUsers",
      },
    );
    addTerraformDependency(iamMember, service);
  }

  return { service };
}
