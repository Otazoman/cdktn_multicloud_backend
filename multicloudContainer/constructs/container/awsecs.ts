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
  listenerArn?: string; // Production listener ARN (for blueGreenDeploymentConfig.productionTrafficRoute)
  testListenerArn?: string; // Test listener ARN (for blueGreenDeploymentConfig.testTrafficRoute)
  productionListenerRuleArn?: string; // Production Listener Rule ARN (for advancedConfiguration.productionListenerRule)
  testListenerRuleArn?: string; // Test Listener Rule ARN (for advancedConfiguration.testListenerRule)
  bakeTime?: number; // Bake time in minutes after deployment before considering stable (0 = disabled)
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

  const cluster =
    (existingCluster as EcsCluster) ??
    new EcsCluster(scope, clusterId, {
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

  // --- 5. Infrastructure Role & Blue/Green Flag ---
  const isBlueGreen = config.deploymentStrategy === "BLUE_GREEN";

  const infraRole = new IamRole(scope, `ecs-infra-role-${config.name}`, {
    provider,
    name: `${config.name}-infra-role`,
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "ecs.amazonaws.com" },
        },
      ],
    }),
  });

  new IamRolePolicyAttachment(scope, `ecs-infra-policy-${config.name}`, {
    provider,
    role: infraRole.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonECS_FullAccess",
  });

  // ECS Native Blue/Green requires ELB permissions on the infrastructure role
  // to perform target health checks (DescribeTargetHealth) and traffic shifting
  // (ModifyListener, ModifyRule, RegisterTargets, DeregisterTargets, etc.)
  new IamRolePolicyAttachment(scope, `ecs-infra-elb-policy-${config.name}`, {
    provider,
    role: infraRole.name,
    policyArn: "arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess",
  });

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
  }

  // --- 6. ECS Service ---
  const service = new EcsService(scope, `service-${config.name}`, {
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
                  roleArn: infraRole.arn,
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
  // Rolling:    ignore load_balancer to prevent forced recreate on TG changes
  // Always:     ignore task_definition to allow external deployments without Terraform drift
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

  // 7. Application Auto Scaling Setup
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
