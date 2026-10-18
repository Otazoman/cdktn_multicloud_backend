import { LOCATION, PROJECT_NAME } from "../common";

// CloudSQL Instance Configurations (PostgreSQL only)
// PSA settings (IP range, prefix length) have been moved to config/google/psa.ts (googlePsaConfig)
export const cloudSqlConfig = {
  project: PROJECT_NAME,
  instances: [
    // PostgreSQL Instance
    {
      build: true,
      name: "cloudsql-postgres-instance-2026-1018-1100",
      // DNS A record name for google.inner zone (e.g., cloudsql-postgres.google.inner)
      aRecordName: "cloudsql-postgres.google.inner",
      edition: "ENTERPRISE",
      // edition: "ENTERPRISE_PLUS",
      databaseVersion: "POSTGRES_18",
      tier: "db-custom-2-8192",
      // tier: "db-perf-optimized-N-2",
      region: LOCATION,
      availabilityType: "ZONAL",
      diskType: "PD_SSD",
      diskSize: 10,
      diskAutoresize: true,
      diskAutoresizeLimit: 100,
      username: process.env.GOOGLEDB_ROOT_USER!,
      password: process.env.GOOGLEDB_ROOT_PASSWORD!,
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
