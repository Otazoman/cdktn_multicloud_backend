import { AppautoscalingPolicy } from "@cdktn/provider-aws/lib/appautoscaling-policy";
import { AppautoscalingTarget } from "@cdktn/provider-aws/lib/appautoscaling-target";
import { CloudwatchLogGroup } from "@cdktn/provider-aws/lib/cloudwatch-log-group";
import { EcsCluster } from "@cdktn/provider-aws/lib/ecs-cluster";
import { EcsService } from "@cdktn/provider-aws/lib/ecs-service";
import { EcsTaskDefinition } from "@cdktn/provider-aws/lib/ecs-task-definition";
import { IamRole } from "@cdktn/provider-aws/lib/iam-role";
import { IamRolePolicyAttachment } from "@cdktn/provider-aws/lib/iam-role-policy-attachment";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Construct } from "constructs";

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
  name: string;
  clusterName: string;
  cpu: string;
  memory: string;
  desiredCount: number;
  deploymentStrategy?: string; // "ROLLING" | "BLUE_GREEN"
  autoScaling?: AutoScalingConfig;
  logRetentionInDays?: number; // CloudWatch Logs retention period (e.g., 1, 3, 7, 14, 30...)
  securityGroupIds: string[];
  subnetIds: string[];
  containerConfig: ContainerConfig;
  targetGroupArn?: string;
  targetGroupArnGreen?: string;
  targetGroupName?: string;
  targetGroupNameGreen?: string;
  listenerArn?: string;
  bakeTime?: number;
  enableExec?: boolean;
  tags?: { [key: string]: string };
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

  const cluster = (existingCluster as EcsCluster) ?? new EcsCluster(scope, clusterId, {
    provider,
    name: config.clusterName,
    tags: config.tags,
  });

  // 2. CloudWatch Log Group for Container Logs
  const logGroup = new CloudwatchLogGroup(scope, `log-group-${config.name}`, {
    provider,
    name: `/ecs/${config.name}`,
    retentionInDays: config.logRetentionInDays ?? 7,
  });

  // 3. IAM Roles (Execution Role & Task Role)
  const executionRole = new IamRole(scope, `ecs-exec-role-${config.name}`, {
    provider,
    name: `${config.name}-exec-role`,
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "ecs-tasks.amazonaws.com" },
        },
      ],
    }),
  });

  // Task Role is required specifically for ECS Exec (different from Execution Role)
  const taskRole = new IamRole(scope, `ecs-task-role-${config.name}`, {
    provider,
    name: `${config.name}-task-role`,
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "ecs-tasks.amazonaws.com" },
        },
      ],
    }),
  });

  // Standard execution policy
  new IamRolePolicyAttachment(scope, `ecs-exec-policy-${config.name}`, {
    provider,
    role: executionRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  });

  // ECS Exec specific permissions for the Task Role
  if (config.enableExec) {
    new IamRolePolicyAttachment(scope, `ecs-exec-ssm-${config.name}`, {
      provider,
      role: taskRole.name,
      // This policy provides permissions for SSMMessages and logs required by ECS Exec
      policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    });
  }

  // 4. Task Definition
  const taskDefinition = new EcsTaskDefinition(
    scope,
    `task-def-${config.name}`,
    {
      provider,
      family: config.name,
      cpu: config.cpu,
      memory: config.memory,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      executionRoleArn: executionRole.arn,
      taskRoleArn: taskRole.arn,
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
              "awslogs-group": logGroup.name,
              "awslogs-region": provider.region,
              "awslogs-stream-prefix": "ecs",
            },
          },
          environment: config.containerConfig.environment,
        },
      ]),
      tags: config.tags,
    },
  );

  // 5. ECS Service
  const isBlueGreen = config.deploymentStrategy === "BLUE_GREEN";

  const service = new EcsService(scope, `service-${config.name}`, {
    provider,
    name: config.name,
    cluster: cluster.id,
    taskDefinition: taskDefinition.arn,
    desiredCount: config.desiredCount,
    launchType: "FARGATE",

    deploymentConfiguration: {
      deploymentOption: isBlueGreen ? "WITH_TRAFFIC_CONTROL" : undefined,
      strategy: config.deploymentStrategy,
      blueGreenDeploymentConfig: isBlueGreen
        ? {
            bakeTimeInMinutes: config.bakeTime ?? 3,
            productionTrafficRoute: { listenerArn: config.listenerArn },
            targetGroup: {
              blue: config.targetGroupName,
              green: config.targetGroupNameGreen,
            },
          }
        : undefined,
      deploymentCircuitBreaker: { enable: true, rollback: true },
      minHealthyPercent: 100,
      maxPercent: 200,
    } as any,

    networkConfiguration: {
      securityGroups: config.securityGroupIds,
      subnets: config.subnetIds,
      assignPublicIp: true,
    },

    deploymentController: { type: "ECS" },

    // Note: Only one load balancer is defined to avoid Terraform validation issues
    // while keeping Native Blue/Green compatibility through blueGreenDeploymentConfig
    loadBalancer: config.targetGroupArn ? [
      {
        targetGroupArn: config.targetGroupArn,
        containerName: config.containerConfig.name,
        containerPort: config.containerConfig.containerPort,
      },
    ] : undefined,
    enableExecuteCommand: config.enableExec ?? false,
    tags: config.tags,
  });

  // Dynamic Lifecycle Management
  // If Auto Scaling is enabled, desired_count must be ignored by Terraform
  const ignoreChanges = ["load_balancer", "task_definition"];
  if (config.autoScaling?.enabled) {
    ignoreChanges.push("desired_count");
  }

  service.addOverride("lifecycle", {
    ignore_changes: ignoreChanges,
  });

  // 6. Application Auto Scaling Setup
  if (config.autoScaling?.enabled) {
    const target = new AppautoscalingTarget(
      scope,
      `asg-target-${config.name}`,
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
      new AppautoscalingPolicy(scope, `asg-policy-cpu-${config.name}`, {
        provider,
        name: `${config.name}-cpu-scaling`,
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
      new AppautoscalingPolicy(scope, `asg-policy-mem-${config.name}`, {
        provider,
        name: `${config.name}-mem-scaling`,
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
  }

  return { cluster, taskDefinition, service, logGroup };
}
