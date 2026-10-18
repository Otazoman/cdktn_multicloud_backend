import type { AutoScalingConfig } from "../../constructs/container/awsecs";

/**
 * Per-cluster settings, keyed by clusterName (optional).
 * containerInsights: "enhanced" (recommended by AWS, adds metric charges) /
 * "enabled" / "disabled". Omitted: the account setting.
 */
export const awsEcsClusterSettings: Record<
  string,
  { containerInsights?: "enhanced" | "enabled" | "disabled" }
> = {};

/**
 * AWS ECS Multiple Service Configurations
 *
 * autoScaling: target tracking on CPU (cpuThreshold, %), memory
 * (memoryThreshold, %) and, for ROLLING deployments behind an ALB, requests
 * per task (requestCountPerTarget, ALBRequestCountPerTarget on
 * targetGroupName). Omitted metrics are not used.
 *
 * Optional log settings per service: logMode ("blocking" / "non-blocking";
 * omitted: the account setting, non-blocking since 2025-06-25) and
 * logMaxBufferSize (non-blocking buffer, e.g. "25m"; default 10m). Log
 * retention is set on the log group in cloudwatchlogs.ts.
 */
export interface AwsEcsSettings {
  /** Construct ID key (Terraform address). Defaults to `name` */
  key?: string;
  name: string;
  build: boolean;
  clusterName: string;
  cpu: string;
  memory: string;
  desiredCount: number;
  deploymentStrategy: "ROLLING" | "BLUE_GREEN";
  /** Blue/Green: minutes before the deployment is considered stable */
  bakeTime?: number;
  enableExec?: boolean;
  autoScaling?: AutoScalingConfig;
  /** Role names in config/aws/iam.ts; infraRoleName only for BLUE_GREEN */
  executionRoleName: string;
  taskRoleName: string;
  infraRoleName?: string;
  /** Must be a log group of config/aws/cloudwatchlogs.ts */
  cloudwatchLogGroupName: string;
  containerName: string;
  image: string;
  port: number;
  securityGroupNames: string[];
  subnetNames: string[];
  /** Target groups / listeners of config/aws/alb.ts */
  targetGroupName?: string;
  targetGroupNameGreen?: string;
  listenerName?: string;
  testListenerName?: string;
  environment?: { name: string; value: string }[];
  logMode?: "blocking" | "non-blocking";
  logMaxBufferSize?: string;
  tags?: { [key: string]: string };
}

export const awsEcsConfigs: AwsEcsSettings[] = [
  {
    name: "api-service",
    build: true,
    clusterName: "main-cluster", // Shared cluster
    cpu: "256",
    memory: "512",
    desiredCount: 1,
    deploymentStrategy: "BLUE_GREEN",
    bakeTime: 3,
    enableExec: true,
    autoScaling: {
      enabled: true,
      minCapacity: 2,
      maxCapacity: 10,
      cpuThreshold: 70,
      memoryThreshold: 80,
      scaleInCooldown: 300,
      scaleOutCooldown: 60,
      cpuPolicyName: "api-service-cpu-scaling",
      memoryPolicyName: "api-service-mem-scaling",
    },
    // IAM roles used by this service. Names must match the role names
    // defined in config/aws/iam.ts (iamRolesConfig).
    executionRoleName: "ecs-task-execution-role",
    taskRoleName: "ecs-task-role",
    // Only required when deploymentStrategy is "BLUE_GREEN".
    infraRoleName: "ecs-infrastructure-role",
    // CloudWatch Log Group used by this service's container logs. Name
    // must match an entry in config/aws/cloudwatchlogs.ts.
    cloudwatchLogGroupName: "/aws/ecs/api-service",
    containerName: "api-container",
    // Placeholder until CI/CD deploys the API (which listens on 8080);
    // this image also listens on 8080.
    image: "nginxinc/nginx-unprivileged:stable",
    port: 8080,
    securityGroupNames: ["ecs-sg"],
    subnetNames: [
      "my-aws-vpc-private-subnet1a",
      "my-aws-vpc-private-subnet1c",
      "my-aws-vpc-private-subnet1d",
    ],
    targetGroupName: "managed-api-tg-blue",
    targetGroupNameGreen: "managed-api-tg-green",
    listenerName: "production-listener", // Must match the name set in alb.ts listenerConfig.name
    testListenerName: "test-listener", // Must match the name set in alb.ts additionalListeners[].name
    tags: {
      ServiceType: "API",
      ManagedBy: "CDKTN",
    },
  },
];
