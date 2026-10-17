// RDS Instance Configurations (PostgreSQL only)
export const rdsConfigs = [
  // PostgreSQL (parameter file path)
  {
    // Not used: the API and the replication use the Aurora cluster below
    // (config/apicontainer.ts)
    build: false,
    identifier: "rds-postgres-instance",
    // Names of resources created for this database (omitted: default name)
    names: {
      subnetGroup: "rds-postgres-instance-sng",
      parameterGroup: "rds-postgres-instance-pg",
      optionGroup: "rds-postgres-instance-og",
    },
    instanceClass: "db.t3.medium",
    engine: "postgres",
    engineVersion: "18.4",
    allocatedStorage: 20,
    storageType: "gp3",
    username: process.env.AWSDB_ROOT_USER!,
    password: process.env.AWSDB_ROOT_PASSWORD!,
    manageMasterUserPassword: false,
    // manageMasterUserPassword: true,
    subnetKeys: [
      "my-aws-vpc-db-private-subnet1a",
      "my-aws-vpc-db-private-subnet1c",
    ],
    vpcSecurityGroupNames: ["myaws-db-sg"],
    parameterGroupFamily: "postgres18",
    parameterGroupParametersFile: "config/aws/aurorards/postgres-parameters.ts", // Path to parameter file
    skipFinalSnapshot: true,
    // Backup
    backupRetentionPeriod: 30,
    preferredBackupWindow: "01:00-02:00",
    // Performance Insights
    enablePerformanceInsights: true,
    performanceInsightsRetentionPeriod: 7,
    // Enhanced Monitoring using an externally created IAM role. Name must
    // match a role name defined in config/aws/iam.ts (iamRolesConfig).
    enableEnhancedMonitoring: true,
    monitoringInterval: 30,
    monitoringRoleName: "rds-enhanced-monitoring-role",
    // Logs. Each entry here must have a matching CloudWatch Log Group
    // defined in config/aws/cloudwatchlogs.ts
    // (name: /aws/rds/instance/rds-postgres-instance/<export-type>).
    enabledCloudwatchLogsExports: ["postgresql", "upgrade"],
    // Auto upgrade
    autoMinorVersionUpgrade: true,
    // Maintenance
    preferredMaintenanceWindow: "sat:03:00-sat:04:00",
    // Multi-AZ
    multiAz: false,
    storageEncrypted: true, // encrypted
    tags: {
      Name: "MyRdsPostgresInstance",
      Owner: "team-A",
    },
  },
];

// Aurora Cluster Configurations (PostgreSQL only)
export const auroraConfigs = [
  // Aurora PostgreSQL (Self-managed password)
  {
    build: true,
    clusterIdentifier: "aurora-postgres-cluster",
    // Names of resources created for this cluster (omitted: default name).
    // instances: one name per instance (instanceCount), in order.
    names: {
      subnetGroup: "aurora-postgres-cluster-sng",
      clusterParameterGroup: "aurora-postgres-cluster-cpg",
      instanceParameterGroup: "aurora-postgres-cluster-ipg",
      instances: ["aurora-postgres-cluster-instance-1"],
    },
    engine: "aurora-postgresql",
    engineVersion: "18.3",
    masterUsername: process.env.AWSDB_ROOT_USER!,
    password: process.env.AWSDB_ROOT_PASSWORD!,
    manageMasterUserPassword: false,
    subnetKeys: [
      "my-aws-vpc-db-private-subnet1a",
      "my-aws-vpc-db-private-subnet1c",
      "my-aws-vpc-db-private-subnet1d",
    ],
    vpcSecurityGroupNames: ["myaws-db-sg"],
    dbClusterParameterGroupFamily: "aurora-postgresql18",
    dbClusterParameterGroupParametersFile:
      "config/aws/aurorards/aurora-postgres-cluster-parameters.ts", // Path to cluster parameter file
    skipFinalSnapshot: true,
    instanceClass: "db.t4g.medium",
    instanceCount: 1,
    instanceParameterGroupFamily: "aurora-postgresql18",
    // Backup
    backupRetentionPeriod: 14,
    preferredBackupWindow: "03:00-04:00",
    // Performance Insights
    enablePerformanceInsights: false,
    // Enhanced Monitoring
    enableEnhancedMonitoring: false,
    // Logs. Each entry here must have a matching CloudWatch Log Group
    // defined in config/aws/cloudwatchlogs.ts
    // (name: /aws/rds/cluster/aurora-postgres-cluster/<export-type>).
    enabledCloudwatchLogsExports: ["postgresql"],
    // Auto upgrade
    autoMinorVersionUpgrade: false,
    // Maintenance
    preferredMaintenanceWindow: "mon:04:00-mon:05:00",
    instancePreferredMaintenanceWindow: "mon:05:00-mon:06:00",
    tags: {
      Name: "MyAuroraPostgresCluster",
      Owner: "team-A",
    },
  },
];
