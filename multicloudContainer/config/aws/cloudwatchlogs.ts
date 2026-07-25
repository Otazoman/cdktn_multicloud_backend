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
  // --- RDS: rds-mysql-instance (aurorards.ts -> rdsConfigs) ---
  {
    name: "/aws/rds/instance/rds-mysql-instance/audit",
    retentionInDays: 7,
    tags: { Component: "Database", ManagedBy: "CDKTN" },
  },
  {
    name: "/aws/rds/instance/rds-mysql-instance/error",
    retentionInDays: 7,
    tags: { Component: "Database", ManagedBy: "CDKTN" },
  },
  {
    name: "/aws/rds/instance/rds-mysql-instance/general",
    retentionInDays: 7,
    tags: { Component: "Database", ManagedBy: "CDKTN" },
  },
  {
    name: "/aws/rds/instance/rds-mysql-instance/slowquery",
    retentionInDays: 7,
    tags: { Component: "Database", ManagedBy: "CDKTN" },
  },

  // --- RDS: rds-postgres-instance (aurorards.ts -> rdsConfigs) ---
  {
    name: "/aws/rds/instance/rds-postgres-instance/postgresql",
    retentionInDays: 30,
    tags: { Component: "Database", ManagedBy: "CDKTN" },
  },
  {
    name: "/aws/rds/instance/rds-postgres-instance/upgrade",
    retentionInDays: 30,
    tags: { Component: "Database", ManagedBy: "CDKTN" },
  },

  // --- Aurora: aurora-mysql-cluster (aurorards.ts -> auroraConfigs) ---
  {
    name: "/aws/rds/cluster/aurora-mysql-cluster/audit",
    retentionInDays: 7,
    tags: { Component: "Database", ManagedBy: "CDKTN" },
  },
  {
    name: "/aws/rds/cluster/aurora-mysql-cluster/error",
    retentionInDays: 7,
    tags: { Component: "Database", ManagedBy: "CDKTN" },
  },
  {
    name: "/aws/rds/cluster/aurora-mysql-cluster/general",
    retentionInDays: 7,
    tags: { Component: "Database", ManagedBy: "CDKTN" },
  },
  {
    name: "/aws/rds/cluster/aurora-mysql-cluster/slowquery",
    retentionInDays: 7,
    tags: { Component: "Database", ManagedBy: "CDKTN" },
  },

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

  // --- ECS: worker-service (ecs.ts -> awsEcsConfigs) ---
  {
    name: "/aws/ecs/worker-service",
    retentionInDays: 14,
    tags: { Component: "Application", ManagedBy: "CDKTN" },
  },

  // --- CodeBuild: api-service-cicd (cicdsettings.ts -> awsCicdConfigs) ---
  {
    name: "/aws/codebuild/api-service-cicd",
    retentionInDays: 7,
    tags: { Component: "CICD", ManagedBy: "CDKTN" },
  },

  // --- VPN Customer Gateway tunnel logs (vpn.ts -> createCustomerGatewayParams) ---
  // Name must match `${customerGatewayName}-log-group`, i.e.
  // `my-aws-vpc-aws-<destination>-cgw-log-group`.
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

/**
 * CloudWatch Log Metric Filters. Empty for now - add entries here to
 * extract custom metrics (e.g. error counts) from the log groups above.
 */
export const cloudwatchMetricFiltersConfig = [];

/**
 * CloudWatch Metric Alarms. Empty for now - add entries here to alarm on
 * metrics produced above (either built-in AWS metrics or custom metric
 * filters defined in cloudwatchMetricFiltersConfig).
 */
export const cloudwatchMetricAlarmsConfig = [];
