import type { AwsRelationalDatabaseConfig } from "../../../constructs/relationaldatabase/awsrelationaldatabase";

/**
 * RDS instances (PostgreSQL only). None is built: the API and the
 * replication use the Aurora cluster below (config/apicontainer.ts). The
 * fields are those of an Aurora entry, with `identifier` and `username`
 * (docs/configuration/aws.md).
 */
export type AwsRdsSettings = Omit<AwsRelationalDatabaseConfig, "type" | "masterUsername"> & {
  build: boolean;
  username?: string;
  monitoringRoleName?: string;
};

export const rdsConfigs: AwsRdsSettings[] = [];

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
