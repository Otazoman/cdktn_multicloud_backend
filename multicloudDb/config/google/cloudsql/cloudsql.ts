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
      build: false,
      name: "cloudsql-mysql-instance-2025-1108-1600",
      databaseVersion: "MYSQL_8_0",
      edition: "ENTERPRISE",
      tier: "db-f1-micro",
      region: "asia-northeast1",
      availabilityType: "ZONAL", // ZONAL or REGIONAL
      diskType: "PD_SSD",
      diskSize: 20,
      diskAutoresize: true,
      diskAutoresizeLimit: 100,
      username: "root",
      password: "mysecurepassword",
      managedPasswordEnabled: false, // Set to true to use Google-managed passwords
      privateNetwork: true, // Enable private IP
      authorizedNetworks: [], // For public IP access (empty for private only)
      // Backup configuration
      backupEnabled: true,
      backupStartTime: "03:00",
      backupRetainedBackups: 7,
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
      build: false,
      name: "cloudsql-postgres-instance-2025-1108-1600",
      databaseVersion: "POSTGRES_15",
      edition: "ENTERPRISE",
      tier: "db-f1-micro",
      region: "asia-northeast1",
      availabilityType: "ZONAL",
      diskType: "PD_SSD",
      diskSize: 20,
      diskAutoresize: true,
      diskAutoresizeLimit: 100,
      username: "root",
      password: "mysecurepassword",
      managedPasswordEnabled: false,
      privateNetwork: true,
      authorizedNetworks: [],
      // Backup configuration
      backupEnabled: true,
      backupStartTime: "02:00",
      backupRetainedBackups: 14,
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
