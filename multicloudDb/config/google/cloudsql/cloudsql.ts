// CloudSQL Instance Configurations
export const cloudSqlConfig = {
  project: "multicloud-sitevpn-project",
  // Private network settings
  privateIpRangeName: "cloudsql-private-ip", // Changed name to ensure uniqueness
  googleManagedServicesVpcAddress: "10.100.0.0", // Changed IP address to avoid conflicts
  prefixLength: 16,
  instances: [
    // MySQL Instance
    {
      build: true,
      name: "cloudsql-mysql-instance-2026-0102-1300",
      // DNS A record name for google.inner zone (e.g., cloudsql-mysql.google.inner)
      aRecordName: "cloudsql-mysql.google.inner",
      edition: "ENTERPRISE",
      databaseVersion: "MYSQL_8_0",
      tier: "db-f1-micro",
      // edition: "ENTERPRISE_PLUS",
      // databaseVersion: "MYSQL_8_4",
      // tier: "db-perf-optimized-N-2",
      region: "asia-northeast1",
      availabilityType: "ZONAL", // ZONAL or REGIONAL
      diskType: "PD_SSD",
      diskSize: 10,
      diskAutoresize: true,
      diskAutoresizeLimit: 100,
      username: "root",
      password: "MySecurePassword123!",
      managedPasswordEnabled: false, // Set to true to use Google-managed passwords
      privateNetwork: true, // Enable private IP
      authorizedNetworks: [], // For public IP access (empty for private only)
      // Backup configuration
      backupEnabled: true,
      backupStartTime: "03:00",
      backupRetainedBackups: 8,
      backupTransactionLogRetentionDays: 7,
      // Point-in-time recovery for MySQL requires binary logging
      binaryLogEnabled: true,
      // Maintenance window
      maintenanceWindowDay: 7, // Sunday
      maintenanceWindowHour: 3,
      maintenanceUpdateTrack: "stable", // stable or canary
      // High availability
      highAvailabilityEnabled: false, // Set to true for regional availability
      // Insights and monitoring
      insightsEnabled: true,
      queryStringLength: 1024,
      recordApplicationTags: true,
      recordClientAddress: true,
      // Deletion protection
      deletionProtection: false,
      // Labels
      labels: {
        name: "cloudsql-mysql",
        owner: "team-a",
        environment: "dev",
      },
      databaseFlagsFile: "config/google/cloudsql/mysql-parameters.ts",
    },
    // PostgreSQL Instance
    {
      build: true,
      name: "cloudsql-postgres-instance-2026-0102-1300",
      // DNS A record name for google.inner zone (e.g., cloudsql-postgres.google.inner)
      aRecordName: "cloudsql-postgres.google.inner",
      edition: "ENTERPRISE",
      databaseVersion: "POSTGRES_15",
      tier: "db-f1-micro",
      // edition: "ENTERPRISE_PLUS",
      // databaseVersion: "POSTGRES_17",
      // tier: "db-perf-optimized-N-2",
      region: "asia-northeast1",
      availabilityType: "ZONAL",
      diskType: "PD_SSD",
      diskSize: 10,
      diskAutoresize: true,
      diskAutoresizeLimit: 100,
      username: "root",
      password: "MySecurePassword123!",
      managedPasswordEnabled: false,
      privateNetwork: true,
      authorizedNetworks: [],
      // Backup configuration
      backupEnabled: true,
      backupStartTime: "02:00",
      backupRetainedBackups: 8,
      backupTransactionLogRetentionDays: 7,
      // Point-in-time recovery
      pointInTimeRecoveryEnabled: true,
      // Maintenance window
      maintenanceWindowDay: 1, // Monday
      maintenanceWindowHour: 2,
      maintenanceUpdateTrack: "stable",
      // High availability
      highAvailabilityEnabled: false,
      // Insights and monitoring
      insightsEnabled: true,
      queryStringLength: 1024,
      recordApplicationTags: true,
      recordClientAddress: true,
      // Deletion protection
      deletionProtection: false,
      // Labels
      labels: {
        name: "cloudsql-postgres",
        owner: "team-a",
        environment: "dev",
      },
      databaseFlagsFile: "config/google/cloudsql/postgres-parameters.ts",
    },
  ],
};
