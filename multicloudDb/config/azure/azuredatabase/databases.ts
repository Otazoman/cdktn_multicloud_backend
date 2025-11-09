import { LOCATION, RESOURCE_GROUP } from "../common";

// Azure Database for MySQL and PostgreSQL Configurations
export const azureDatabaseConfig = {
  resourceGroupName: RESOURCE_GROUP,
  location: LOCATION,
  databases: [
    // Azure Database for MySQL Flexible Server
    {
      build: true,
      type: "mysql" as const,
      name: "mysql-database",
      serverName: "azure-mysql-server-2025-1108",
      subnetKey: "db-mysql-subnet", // Each database needs its own subnet
      serverAdminLogin: "mysqladmin",
      serverAdminPassword: "YourSecurePassword123!",
      // skuName: "GP_Standard_D2ds_v4", // General Purpose D2ads_v5, 2 vCore, 8GB RAM (minimum for VNet) Cpacity Error
      skuName: "B_Standard_B1ms",
      storageMb: 32768, // 32 GB
      storageIops: 400, // Storage IOPS
      version: "8.0.21", // MySQL 8.0 (meets requirement)
      // Backup configuration
      backupRetentionDays: 7,
      geoRedundantBackupEnabled: false,
      // High Availability
      zone: "1",
      highAvailabilityMode: undefined, // "ZoneRedundant" or "SameZone" or undefined
      standbyAvailabilityZone: undefined,
      // Networking
      publicNetworkAccessEnabled: false, // VNet integration only
      // Maintenance window
      maintenanceWindow: {
        dayOfWeek: 0, // Sunday
        startHour: 2,
        startMinute: 0,
      },
      // Security
      tlsEnforcementEnabled: true,
      // Labels
      tags: {
        Environment: "Dev",
        Owner: "TeamA",
        Database: "MySQL",
      },
      configurationParametersFile:
        "config/azure/azuredatabase/mysql-parameters.ts",
    },
    // Azure Database for PostgreSQL Flexible Server
    {
      build: true,
      type: "postgresql" as const,
      name: "postgres-database",
      serverName: "azure-postgres-server-2025-1108",
      subnetKey: "db-postgres-subnet", // Each database needs its own subnet (matches subnets.ts)
      serverAdminLogin: "postgresadmin",
      serverAdminPassword: "YourSecurePassword123!",
      // skuName: "GP_Standard_D2ds_v4", // General Purpose D2ds_v4, 2 vCore, 8GB RAM (minimum for VNet)  Cpacity Error
      skuName: "B_Standard_B1ms",
      storageMb: 32768, // 32 GB
      storageIops: 360, // Storage IOPS
      version: "15", // PostgreSQL 15 (meets requirement)
      // Backup configuration
      backupRetentionDays: 7,
      geoRedundantBackupEnabled: false,
      // High Availability
      zone: "1",
      highAvailabilityMode: undefined, // "ZoneRedundant" or "SameZone" or undefined
      standbyAvailabilityZone: undefined,
      // Networking
      publicNetworkAccessEnabled: false, // VNet integration only
      // Maintenance window
      maintenanceWindow: {
        dayOfWeek: 1, // Monday
        startHour: 2,
        startMinute: 0,
      },
      // Labels
      tags: {
        Environment: "Dev",
        Owner: "TeamB",
        Database: "PostgreSQL",
      },
      configurationParametersFile:
        "config/azure/azuredatabase/postgres-parameters.ts",
    },
  ],
};
