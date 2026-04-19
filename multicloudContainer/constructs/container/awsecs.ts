import { CloudwatchLogGroup } from "@cdktn/provider-aws/lib/cloudwatch-log-group";
import { EcsCluster } from "@cdktn/provider-aws/lib/ecs-cluster";
import { EcsService } from "@cdktn/provider-aws/lib/ecs-service";
import { EcsTaskDefinition } from "@cdktn/provider-aws/lib/ecs-task-definition";
import { IamRole } from "@cdktn/provider-aws/lib/iam-role";
import { IamRolePolicyAttachment } from "@cdktn/provider-aws/lib/iam-role-policy-attachment";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Construct } from "constructs";

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
  cpu: string; // e.g., "256"
  memory: string; // e.g., "512"
  desiredCount: number;
  securityGroupIds: string[];
  subnetIds: string[];
  containerConfig: ContainerConfig;
  targetGroupArn?: string;
  targetGroupArnGreen?: string;
  targetGroupName?: string;
  targetGroupNameGreen?: string;
  listenerArn?: string;
  useBlueGreen?: boolean;
  bakeTime?: number;
  tags?: { [key: string]: string };
}

export function createAwsEcsFargateResources(
  scope: Construct,
  provider: AwsProvider,
  config: EcsConfig,
) {
  // 1. ECS Cluster
  const cluster = new EcsCluster(scope, `cluster-${config.name}`, {
    provider,
    name: config.clusterName,
    tags: config.tags,
  });

  // 2. CloudWatch Log Group for Container Logs
  const logGroup = new CloudwatchLogGroup(scope, `log-group-${config.name}`, {
    provider,
    name: `/ecs/${config.name}`,
    retentionInDays: 7,
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

  new IamRolePolicyAttachment(scope, `ecs-exec-policy-${config.name}`, {
    provider,
    role: executionRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  });

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
  const service = new EcsService(scope, `service-${config.name}`, {
    provider,
    name: config.name,
    cluster: cluster.id,
    taskDefinition: taskDefinition.arn,
    desiredCount: config.desiredCount,
    launchType: "FARGATE",

    deploymentConfiguration: {
      //Native Blue/Green
      deploymentOption: "WITH_TRAFFIC_CONTROL",
      strategy: config.useBlueGreen ? "BLUE_GREEN" : "ROLLING",
      blueGreenDeploymentConfig: config.useBlueGreen
        ? {
            bakeTimeInMinutes: config.bakeTime ?? 3,
            productionTrafficRoute: {
              listenerArn: config.listenerArn,
            },
            targetGroup: {
              blue: config.targetGroupName,
              green: config.targetGroupNameGreen,
            },
          }
        : undefined,
      deploymentCircuitBreaker: {
        enable: true,
        rollback: true,
      },
      minHealthyPercent: 100,
      maxPercent: 200,
    } as any,

    networkConfiguration: {
      securityGroups: config.securityGroupIds,
      subnets: config.subnetIds,
      assignPublicIp: true,
    },

    deploymentController: {
      type: "ECS",
    },

    loadBalancer: [
      {
        targetGroupArn: config.targetGroupArn,
        containerName: config.containerConfig.name,
        containerPort: config.containerConfig.containerPort,
      },
    ],
    tags: config.tags,
  });

  // This override is required. Without it, Terraform will attempt to reset
  service.addOverride("lifecycle", {
    ignore_changes: ["load_balancer", "task_definition"],
  });
  return { cluster, taskDefinition, service, logGroup };
}
