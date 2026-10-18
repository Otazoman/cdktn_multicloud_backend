/**
 * CloudWatch Log Group definitions.
 *
 * These are pure static configuration, following the same style as
 * iam.ts. Log Groups are created up-front (before the resources that
 * write to them) so that the whole stack - including logs - can be
 * managed and destroyed by CDKTN as a single unit.
 *
 * IMPORTANT: Each `name` below must exactly match the log group name
 * referenced from the corresponding resource config file
 * (aurorards.ts / ecs.ts / cicdsettings.ts / vpn.ts), otherwise the
 * resource construct will fail to find its Log Group.
 */
export const cloudwatchLogGroupsConfig = [
  // --- Aurora: aurora-postgres-cluster (aurorards.ts -> auroraConfigs) ---
  {
    name: "/aws/rds/cluster/aurora-postgres-cluster/postgresql",
    retentionInDays: 14,
    tags: { Component: "Database", ManagedBy: "CDKTN" },
  },

  // --- ECS: api-service (ecs.ts -> awsEcsConfigs) ---
  {
    name: "/aws/ecs/api-service",
    retentionInDays: 7,
    tags: { Component: "Application", ManagedBy: "CDKTN" },
  },


  // --- CodeBuild: api-service-cicd (cicdsettings.ts -> awsCicdConfigs) ---
  {
    name: "/aws/codebuild/api-service-cicd",
    retentionInDays: 7,
    tags: { Component: "CICD", ManagedBy: "CDKTN" },
  },

  // --- VPN Customer Gateway tunnel logs ---
  // Names must match customerGateways.<destination>.logGroupName in vpn.ts.
  {
    name: "my-aws-vpc-aws-google-cgw-log-group",
    retentionInDays: 14,
    tags: { Component: "Network", ManagedBy: "CDKTN" },
  },
  {
    name: "my-aws-vpc-aws-azure-cgw-log-group",
    retentionInDays: 14,
    tags: { Component: "Network", ManagedBy: "CDKTN" },
  },
];
