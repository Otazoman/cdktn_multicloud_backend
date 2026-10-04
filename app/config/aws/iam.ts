/**
 * IAM Role definitions created up-front so that other AWS resources
 * (Aurora/RDS, ECS, CodeBuild, ...) can simply reference the resulting
 * role ARN (by name) instead of letting each resource auto-create (and
 * later orphan) its own role.
 */
export const iamRolesConfig = [
  // 1. RDS Enhanced Monitoring Role
  {
    name: "rds-enhanced-monitoring-role",
    assumeRolePolicy: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            Service: "monitoring.rds.amazonaws.com",
          },
        },
      ],
    },
    managedPolicyArns: [
      "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole",
    ],
  },

  // 2. ECS Task Execution Role (used by the ECS agent to pull images / write logs)
  {
    name: "ecs-task-execution-role",
    assumeRolePolicy: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            Service: "ecs-tasks.amazonaws.com",
          },
        },
      ],
    },
    managedPolicyArns: [
      "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
      "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    ],
  },

  // 3. ECS Task Role (used by the application containers themselves)
  {
    name: "ecs-task-role",
    assumeRolePolicy: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            Service: "ecs-tasks.amazonaws.com",
          },
        },
      ],
    },
    managedPolicyArns: ["arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"],
  },

  // 4. ECS Infrastructure Role (required for ECS Blue/Green deployments)
  {
    name: "ecs-infrastructure-role",
    assumeRolePolicy: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            Service: "ecs.amazonaws.com",
          },
        },
      ],
    },
    managedPolicyArns: [
      "arn:aws:iam::aws:policy/AmazonECS_FullAccess",
      "arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess",
    ],
  },

  // 5. CodeBuild Service Role
  {
    name: "codebuild-service-role",
    assumeRolePolicy: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            Service: "codebuild.amazonaws.com",
          },
        },
      ],
    },
    managedPolicyArns: [
      "arn:aws:iam::aws:policy/AmazonVPCFullAccess",
      "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser",
      "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
    ],
    inlinePolicies: [
      {
        name: "codebuild-custom-policy",
        // NOTE: policy must be a plain object here - AwsIamResources takes
        // care of JSON.stringify() internally.
        policy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "s3:GetObject",
                "s3:GetObjectVersion",
                "s3:PutObject",
                "s3:GetBucketLocation",
                "s3:ListBucket",
              ],
              Resource: ["*"],
            },
          ],
        },
      },
    ],
  },
];

/**
 * Standalone IAM Policies. Currently empty - add entries here if a policy
 * needs to be shared across multiple roles via customPolicyNames.
 */
export const iamPoliciesConfig = [];
