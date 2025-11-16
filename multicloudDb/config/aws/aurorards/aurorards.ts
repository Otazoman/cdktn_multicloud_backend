// RDS Instance Configurations
export const rdsConfigs = [
  // MySQL (Transitioning to AWS-managed password)
  {
    build: false,
    identifier: "rds-mysql-instance",
    instanceClass: "db.t3.medium",
    engine: "mysql",
    engineVersion: "8.4.6",
    allocatedStorage: 20,
    storageType: "gp3",
    username: "root",
    password: "mysecurepassword", // Removed for AWS-managed password
    manageMasterUserPassword: false,
    // suppressSecretOutput: true, // Temporarily suppress output during migration
    subnetKeys: [
      "my-aws-vpc-db-private-subnet1a",
      "my-aws-vpc-db-private-subnet1c",
    ],
    vpcSecurityGroupNames: ["myaws-db-sg"],
    parameterGroupFamily: "mysql8.4",
    parameterGroupParametersFile: "config/aws/aurorards/mysql-parameters.ts", // Path to parameter file
    optionGroupOptionsFile: "config/aws/aurorards/mysql-options.ts", // Path to option file
    skipFinalSnapshot: true,
    // Backup
    backupRetentionPeriod: 7,
    preferredBackupWindow: "02:00-03:00",
    // Performance Insights
    enablePerformanceInsights: true,
    performanceInsightsRetentionPeriod: 7,
    // Enhanced Monitoring with auto-created role
    enableEnhancedMonitoring: true,
    monitoringInterval: 60,
    createMonitoringRole: true, // Automatically create monitoring role
    // Logs
    enabledCloudwatchLogsExports: ["audit", "error", "general", "slowquery"],
    // Auto upgrade
    autoMinorVersionUpgrade: true,
    // Maintenance
    preferredMaintenanceWindow: "sun:03:00-sun:04:00",
    // Multi-AZ
    multiAz: false,
    storageEncrypted: true,
    tags: {
      Name: "MyRdsMysqlInstance",
      Owner: "team-A",
    },
  },
  // MariaDB (RDS-managed password with Secrets Manager)
  {
    build: false,
    identifier: "rds-mariadb-instance",
    instanceClass: "db.t3.micro",
    engine: "mariadb",
    engineVersion: "10.6",
    allocatedStorage: 20,
    storageType: "gp3",
    manageMasterUserPassword: true,
    subnetKeys: [
      "my-aws-vpc-db-private-subnet1a",
      "my-aws-vpc-db-private-subnet1c",
    ],
    vpcSecurityGroupNames: ["myaws-db-sg"],
    parameterGroupFamily: "mariadb10.6",
    skipFinalSnapshot: true,
    // Backup
    backupRetentionPeriod: 14,
    preferredBackupWindow: "02:00-03:00",
    // Performance Insights
    enablePerformanceInsights: false,
    // Enhanced Monitoring
    enableEnhancedMonitoring: false,
    // Logs
    enabledCloudwatchLogsExports: ["audit", "error", "general", "slowquery"],
    // Auto upgrade
    autoMinorVersionUpgrade: false,
    // Maintenance
    preferredMaintenanceWindow: "mon:03:00-mon:04:00",
    // Multi-AZ
    multiAz: false,
    tags: {
      Name: "MyRdsMariadbInstance",
      Owner: "team-A",
    },
  },
  // PostgreSQL (parameter file path)
  {
    build: false,
    identifier: "rds-postgres-instance",
    instanceClass: "db.t3.medium",
    engine: "postgres",
    engineVersion: "17.10",
    allocatedStorage: 20,
    storageType: "gp3",
    username: "root",
    manageMasterUserPassword: true,
    subnetKeys: [
      "my-aws-vpc-db-private-subnet1a",
      "my-aws-vpc-db-private-subnet1c",
    ],
    vpcSecurityGroupNames: ["myaws-db-sg"],
    parameterGroupFamily: "postgres15",
    parameterGroupParametersFile: "config/aws/aurorards/postgres-parameters.ts", // Path to parameter file
    skipFinalSnapshot: true,
    // Backup
    backupRetentionPeriod: 30,
    preferredBackupWindow: "01:00-02:00",
    // Performance Insights
    enablePerformanceInsights: true,
    performanceInsightsRetentionPeriod: 7,
    // Enhanced Monitoring with auto-created role
    enableEnhancedMonitoring: true,
    monitoringInterval: 30,
    createMonitoringRole: true,
    // Logs
    enabledCloudwatchLogsExports: ["postgresql", "upgrade"],
    // Auto upgrade
    autoMinorVersionUpgrade: true,
    // Maintenance
    preferredMaintenanceWindow: "sat:03:00-sat:04:00",
    // Multi-AZ
    multiAz: true,
    storageEncrypted: true, // encrypted
    tags: {
      Name: "MyRdsPostgresInstance",
      Owner: "team-A",
    },
  },
];

// Aurora Cluster Configurations
export const auroraConfigs = [
  // Aurora MySQL (RDS-managed password with advanced features)
  {
    build: false,
    clusterIdentifier: "aurora-mysql-cluster",
    engine: "aurora-mysql",
    engineVersion: "8.0.mysql_aurora.3.08.2",
    masterUsername: "root",
    manageMasterUserPassword: true,
    subnetKeys: [
      "my-aws-vpc-db-private-subnet1a",
      "my-aws-vpc-db-private-subnet1c",
      "my-aws-vpc-db-private-subnet1d",
    ],
    vpcSecurityGroupNames: ["myaws-db-sg"],
    dbClusterParameterGroupFamily: "aurora-mysql8.0",
    dbClusterParameterGroupParametersFile:
      "config/aws/aurorards/aurora-mysql-cluster-parameters.ts", // Path to cluster parameter file
    skipFinalSnapshot: true,
    instanceClass: "db.t4g.medium",
    instanceCount: 1,
    instanceParameterGroupFamily: "aurora-mysql8.0",
    instanceParameterGroupParametersFile:
      "config/aws/aurorards/aurora-mysql-instance-parameters.ts", // Path to instance parameter file
    // Backup
    backupRetentionPeriod: 7,
    preferredBackupWindow: "02:00-03:00",
    // Performance Insights (instance level)
    enablePerformanceInsights: true,
    performanceInsightsRetentionPeriod: 7,
    // Enhanced Monitoring (instance level) with auto-created role
    enableEnhancedMonitoring: true,
    monitoringInterval: 60,
    createMonitoringRole: true, // Automatically create monitoring role
    // Logs (cluster level)
    enabledCloudwatchLogsExports: ["audit", "error", "general", "slowquery"],
    // Auto upgrade (instance level)
    autoMinorVersionUpgrade: true,
    // Maintenance (cluster level)
    preferredMaintenanceWindow: "sun:04:00-sun:05:00",
    // Instance maintenance
    instancePreferredMaintenanceWindow: "sun:05:00-sun:06:00",
    storageEncrypted: true, // 暗号化を有効化
    tags: {
      Name: "MyAuroraMysqlCluster",
      Owner: "team-A",
    },
  },
  // Aurora PostgreSQL (Self-managed password)
  {
    build: false,
    clusterIdentifier: "aurora-postgres-cluster",
    engine: "aurora-postgresql",
    engineVersion: "17.4",
    masterUsername: "root",
    masterPassword: "MySecurePassword123!",
    manageMasterUserPassword: false,
    subnetKeys: [
      "my-aws-vpc-db-private-subnet1a",
      "my-aws-vpc-db-private-subnet1c",
      "my-aws-vpc-db-private-subnet1d",
    ],
    vpcSecurityGroupNames: ["myaws-db-sg"],
    dbClusterParameterGroupFamily: "aurora-postgresql15",
    skipFinalSnapshot: true,
    instanceClass: "db.t4g.medium",
    instanceCount: 1,
    instanceParameterGroupFamily: "aurora-postgresql15",
    // Backup
    backupRetentionPeriod: 14,
    preferredBackupWindow: "03:00-04:00",
    // Performance Insights
    enablePerformanceInsights: false,
    // Enhanced Monitoring
    enableEnhancedMonitoring: false,
    // Logs
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
