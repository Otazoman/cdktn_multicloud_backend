import { AppautoscalingPolicy } from "@cdktn/provider-aws/lib/appautoscaling-policy";
import { AppautoscalingTarget } from "@cdktn/provider-aws/lib/appautoscaling-target";
import { EcsCluster } from "@cdktn/provider-aws/lib/ecs-cluster";
import { EcsService } from "@cdktn/provider-aws/lib/ecs-service";
import { EcsTaskDefinition } from "@cdktn/provider-aws/lib/ecs-task-definition";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Construct } from "constructs";
import { resourceName } from "../../utils/naming";

/**
 * Auto Scaling Configuration
 */
export interface AutoScalingConfig {
  enabled: boolean;
  minCapacity: number;
  maxCapacity: number;
  cpuThreshold?: number;
  memoryThreshold?: number;
  scaleInCooldown?: number;
  scaleOutCooldown?: number;
  /** Default: <project>-aws-ecs-cpu-scaling-<service name> */
  cpuPolicyName?: string;
  /** Default: <project>-aws-ecs-mem-scaling-<service name> */
  memoryPolicyName?: string;
  /** Target ALB requests per task (ALBRequestCountPerTarget). Rolling deployments only */
  requestCountPerTarget?: number;
  /** Default: <project>-aws-ecs-req-scaling-<service name> */
  requestPolicyName?: string;
}

/**
 * ECS Container Definition Configuration
 */
export interface ContainerConfig {
  name: string;
  image: string;
  cpu: number;
  memory: number;
  containerPort: number;
  hostPort: number;
  environment?: { name: string; value: string }[];
}

/**
 * ECS Service and Task Configuration
 */
export interface EcsConfig {
  /**
   * Construct ID key (Terraform address). Defaults to `name`. To rename
   * the resource without replacing it in state, set this to the old value.
   */
  key?: string;
  name: string;
  clusterName: string;
  cpu: string;
  memory: string;
  desiredCount: number;
  deploymentStrategy?: string; // "ROLLING" | "BLUE_GREEN"
  autoScaling?: AutoScalingConfig;
  securityGroupIds: string[];
  subnetIds: string[];
  containerConfig: ContainerConfig;
  targetGroupArn?: string;
  targetGroupArnGreen?: string;
  targetGroupName?: string;
  targetGroupNameGreen?: string;
  listenerArn?: string; // Production listener ARN (for blueGreenDeploymentConfig.productionTrafficRoute)
  testListenerArn?: string; // Test listener ARN (for blueGreenDeploymentConfig.testTrafficRoute)
  productionListenerRuleArn?: string; // Production Listener Rule ARN (for advancedConfiguration.productionListenerRule)
  testListenerRuleArn?: string; // Test Listener Rule ARN (for advancedConfiguration.testListenerRule)
  bakeTime?: number; // Bake time in minutes after deployment before considering stable (0 = disabled)
  enableExec?: boolean;
  tags?: { [key: string]: string };

  // --- Externalized Security and Logging Configurations ---
  // IAM Execution Role ARN used by the ECS container agent to pull images and publish logs
  executionRoleArn: string;
  // IAM Task Role ARN used by the containers themselves to access AWS services
  taskRoleArn: string;
  // IAM Infrastructure Role ARN required for ECS Blue/Green deployment
  infraRoleArn?: string;
  // CloudWatch Log Group Name managed externally for application container logging
  cloudwatchLogGroupName: string;
  /**
   * "<load balancer ARN suffix>/<target group ARN suffix>", required by
   * autoScaling.requestCountPerTarget
   */
  requestCountResourceLabel?: string;
  /** awslogs delivery mode. Default: the account setting (non-blocking since 2025-06-25) */
  logMode?: "blocking" | "non-blocking";
  /** Buffer size for non-blocking mode (e.g. "25m"). Default: 10m */
  logMaxBufferSize?: string;
  /**
   * Container Insights of the cluster, applied when the cluster is created
   * (first service of the cluster). Default: the account setting.
   */
  containerInsights?: "enhanced" | "enabled" | "disabled";
}

export function createAwsEcsFargateResources(
  scope: Construct,
  provider: AwsProvider,
  config: EcsConfig,
) {
  // 1. ECS Cluster
  // Check if a cluster construct with this ID already exists in the current scope.
  const clusterId = `cluster-${config.clusterName}`;
  const existingCluster = scope.node.tryFindChild(clusterId);

  const cluster =
    (existingCluster as EcsCluster) ??
    new EcsCluster(scope, clusterId, {
      provider,
      name: config.clusterName,
      setting: config.containerInsights
        ? [{ name: "containerInsights", value: config.containerInsights }]
        : undefined,
      tags: config.tags,
    });

  // 2. Task Definition
  const taskDefinition = new EcsTaskDefinition(
    scope,
    `task-def-${config.key ?? config.name}`,
    {
      provider,
      family: config.name,
      cpu: config.cpu,
      memory: config.memory,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      // Use externally supplied IAM roles
      executionRoleArn: config.executionRoleArn,
      taskRoleArn: config.taskRoleArn,
      containerDefinitions: JSON.stringify([
        {
          name: config.containerConfig.name,
          image: config.containerConfig.image,
          cpu: config.containerConfig.cpu,
          memory: config.containerConfig.memory,
          essential: true,
          portMappings: [
            {
              containerPort: config.containerConfig.containerPort,
              hostPort: config.containerConfig.hostPort,
              protocol: "tcp",
            },
          ],
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              // Target the externally provided CloudWatch Log Group
              "awslogs-group": config.cloudwatchLogGroupName,
              "awslogs-region": provider.region,
              "awslogs-stream-prefix": "ecs",
              ...(config.logMode ? { mode: config.logMode } : {}),
              ...(config.logMaxBufferSize
                ? { "max-buffer-size": config.logMaxBufferSize }
                : {}),
            },
          },
          environment: config.containerConfig.environment,
        },
      ]),
      tags: config.tags,
    },
  );

  // --- 3. Blue/Green Configuration & Flags ---
  const isBlueGreen = config.deploymentStrategy === "BLUE_GREEN";

  // --- Blue/Green pre-flight validation ---
  if (isBlueGreen) {
    if (!config.targetGroupArn) {
      throw new Error(
        `Blue/Green deployment for "${config.name}" requires targetGroupArn (blue target group).`,
      );
    }
    if (!config.targetGroupArnGreen) {
      throw new Error(
        `Blue/Green deployment for "${config.name}" requires targetGroupArnGreen (green target group).`,
      );
    }
    if (!config.listenerArn) {
      throw new Error(
        `Blue/Green deployment for "${config.name}" requires listenerArn (production listener). ` +
          `Ensure listenerName in ecs.ts matches a named listener in alb.ts.`,
      );
    }
    if (!config.infraRoleArn) {
      throw new Error(
        `Blue/Green deployment for "${config.name}" requires infraRoleArn.`,
      );
    }
  }

  // --- 4. ECS Service ---
  const service = new EcsService(scope, `service-${config.key ?? config.name}`, {
    provider,
    name: config.name,
    cluster: cluster.id,
    taskDefinition: taskDefinition.arn,
    desiredCount: config.desiredCount,
    launchType: "FARGATE",

    deploymentConfiguration: {
      deploymentOption: isBlueGreen ? "WITH_TRAFFIC_CONTROL" : undefined,
      strategy: isBlueGreen ? "BLUE_GREEN" : config.deploymentStrategy,
      // bakeTimeInMinutes: string type, placed directly in deploymentConfiguration.
      // This is the correct field per CDKTF provider schema (not inside blueGreenDeploymentConfig).
      bakeTimeInMinutes:
        isBlueGreen && config.bakeTime !== undefined && config.bakeTime > 0
          ? String(config.bakeTime)
          : undefined,
      deploymentCircuitBreaker: !isBlueGreen
        ? { enable: true, rollback: true }
        : undefined,
      minHealthyPercent: 100,
      maxPercent: 200,
    } as any,

    networkConfiguration: {
      securityGroups: config.securityGroupIds,
      subnets: config.subnetIds,
      assignPublicIp: true,
    },

    deploymentController: { type: "ECS" },

    // loadBalancer with advancedConfiguration is REQUIRED for all entries when using Blue/Green.
    // advancedConfiguration must always be set (not undefined) when isBlueGreen is true.
    loadBalancer: config.targetGroupArn
      ? [
          {
            targetGroupArn: config.targetGroupArn,
            containerName: config.containerConfig.name,
            containerPort: config.containerConfig.containerPort,
            // advancedConfiguration is required for Blue/Green; omitted for rolling deployments.
            // productionListenerRule and testListenerRule must be Listener Rule ARNs,
            // NOT Listener ARNs — ECS API will reject Listener ARNs here.
            advancedConfiguration: isBlueGreen
              ? {
                  alternateTargetGroupArn: config.targetGroupArnGreen!,
                  productionListenerRule: config.productionListenerRuleArn!,
                  testListenerRule: config.testListenerRuleArn,
                  // Use the externally provided infrastructure role
                  roleArn: config.infraRoleArn!,
                }
              : undefined,
          },
        ]
      : undefined,
    enableExecuteCommand: config.enableExec ?? false,
    tags: config.tags,
  });

  // Dynamic Lifecycle Management
  // Blue/Green: ECS manages TG switching internally — do NOT ignore load_balancer
  // Rolling:     ignore load_balancer to prevent forced recreate on TG changes
  // Always:      ignore task_definition to allow external deployments without Terraform drift
  const ignoreChanges = ["task_definition"];
  if (!isBlueGreen) {
    ignoreChanges.push("load_balancer");
  }
  if (config.autoScaling?.enabled) {
    ignoreChanges.push("desired_count");
  }

  service.addOverride("lifecycle", {
    ignore_changes: ignoreChanges,
  });

  // 5. Application Auto Scaling Setup
  if (config.autoScaling?.enabled) {
    const target = new AppautoscalingTarget(
      scope,
      `asg-target-${config.key ?? config.name}`,
      {
        provider,
        maxCapacity: config.autoScaling.maxCapacity,
        minCapacity: config.autoScaling.minCapacity,
        resourceId: `service/${cluster.name}/${service.name}`,
        scalableDimension: "ecs:service:DesiredCount",
        serviceNamespace: "ecs",
      },
    );

    // Target Tracking Scaling Policy: CPU Utilization
    if (config.autoScaling.cpuThreshold) {
      new AppautoscalingPolicy(scope, `asg-policy-cpu-${config.key ?? config.name}`, {
        provider,
        name: resourceName(
          config.autoScaling.cpuPolicyName,
          "aws",
          "ecs-cpu-scaling",
          config.name,
        ),
        policyType: "TargetTrackingScaling",
        resourceId: target.resourceId,
        scalableDimension: target.scalableDimension,
        serviceNamespace: target.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: "ECSServiceAverageCPUUtilization",
          },
          targetValue: config.autoScaling.cpuThreshold,
          scaleInCooldown: config.autoScaling.scaleInCooldown,
          scaleOutCooldown: config.autoScaling.scaleOutCooldown,
        },
      });
    }

    // Target Tracking Scaling Policy: Memory Utilization
    if (config.autoScaling.memoryThreshold) {
      new AppautoscalingPolicy(scope, `asg-policy-mem-${config.key ?? config.name}`, {
        provider,
        name: resourceName(
          config.autoScaling.memoryPolicyName,
          "aws",
          "ecs-mem-scaling",
          config.name,
        ),
        policyType: "TargetTrackingScaling",
        resourceId: target.resourceId,
        scalableDimension: target.scalableDimension,
        serviceNamespace: target.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: "ECSServiceAverageMemoryUtilization",
          },
          targetValue: config.autoScaling.memoryThreshold,
          scaleInCooldown: config.autoScaling.scaleInCooldown,
          scaleOutCooldown: config.autoScaling.scaleOutCooldown,
        },
      });
    }

    // Target Tracking Scaling Policy: ALB requests per target
    if (config.autoScaling.requestCountPerTarget) {
      new AppautoscalingPolicy(scope, `asg-policy-req-${config.key ?? config.name}`, {
        provider,
        name: resourceName(
          config.autoScaling.requestPolicyName,
          "aws",
          "ecs-req-scaling",
          config.name,
        ),
        policyType: "TargetTrackingScaling",
        resourceId: target.resourceId,
        scalableDimension: target.scalableDimension,
        serviceNamespace: target.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: "ALBRequestCountPerTarget",
            resourceLabel: config.requestCountResourceLabel,
          },
          targetValue: config.autoScaling.requestCountPerTarget,
          scaleInCooldown: config.autoScaling.scaleInCooldown,
          scaleOutCooldown: config.autoScaling.scaleOutCooldown,
        },
      });
    }
  }

  return { cluster, taskDefinition, service };
}
