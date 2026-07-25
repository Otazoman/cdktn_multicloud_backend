/**
 * AWS ECS Multiple Service Configurations
 */
export const awsEcsConfigs = [
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
    logRetentionInDays: 7,
    containerName: "api-container",
    image: "nginx:latest",
    port: 80,
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
  {
    name: "worker-service",
    build: true,
    clusterName: "main-cluster",
    cpu: "256",
    memory: "512",
    desiredCount: 1,
    deploymentStrategy: "ROLLING",
    enableExec: false,
    autoScaling: {
      enabled: true,
      minCapacity: 1,
      maxCapacity: 5,
      cpuThreshold: 80, // Different threshold for worker
      memoryThreshold: 90,
      scaleInCooldown: 300,
      scaleOutCooldown: 60,
    },
    // IAM roles used by this service. Names must match the role names
    // defined in config/aws/iam.ts (iamRolesConfig).
    executionRoleName: "ecs-task-execution-role",
    taskRoleName: "ecs-task-role",
    // CloudWatch Log Group used by this service's container logs. Name
    // must match an entry in config/aws/cloudwatchlogs.ts.
    cloudwatchLogGroupName: "/aws/ecs/worker-service",
    logRetentionInDays: 14, // Longer retention for background jobs
    containerName: "worker-container",
    image: "postgres:latest",
    port: 5432,
    securityGroupNames: ["myaws-db-sg"],
    subnetNames: [
      "my-aws-vpc-private-subnet1a",
      "my-aws-vpc-private-subnet1c",
      "my-aws-vpc-private-subnet1d",
    ],
    environment: [{ name: "POSTGRES_PASSWORD", value: "mypassword" }],
    // If worker doesn't need an ALB, these can be optional or point to dummy TGs
    targetGroupName: "managed-worker-tg",
    tags: {
      ServiceType: "Worker",
      ManagedBy: "CDKTN",
    },
  },
];
