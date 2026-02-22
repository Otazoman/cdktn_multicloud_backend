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
  targetGroupArn?: string; // ALBと紐付ける場合に渡す
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
    networkConfiguration: {
      securityGroups: config.securityGroupIds,
      subnets: config.subnetIds,
      assignPublicIp: true,
    },
    loadBalancer: config.targetGroupArn
      ? [
          {
            targetGroupArn: config.targetGroupArn,
            containerName: config.containerConfig.name,
            containerPort: config.containerConfig.containerPort,
          },
        ]
      : undefined,
    tags: config.tags,
  });

  return { cluster, taskDefinition, service, logGroup };
}
