import { envScopedName } from "../../environment";
import { LOCATION, RESOURCE_GROUP } from "../common";

// Azure Database for PostgreSQL Configurations
export const azureDatabaseConfig = {
  resourceGroupName: RESOURCE_GROUP,
  location: LOCATION,
  // Shared privatelink DNS zone VNet link name per database type
  sharedDnsVnetLinkNames: {
    postgresql: "postgresql-shared-vnet-link",
  },
  databases: [
    // Azure Database for PostgreSQL Flexible Server
    {
      build: true,
      type: "postgresql" as const,
      name: "postgres-database",
      // Globally unique; other environments than dev get the environment name appended
      serverName: envScopedName("azure-postgres-server-2025-1108"),
      subnetKey: "db-postgres-subnet", // Each database needs its own subnet (matches subnets.ts)
      serverAdminLogin: process.env.AZUREDB_ROOT_USER!,
      serverAdminPassword: process.env.AZUREDB_ROOT_PASSWORD!,
      // High availability needs General Purpose or Memory Optimized (not Burstable, e.g. B_Standard_B1ms)
      skuName: "GP_Standard_D2ds_v5",
      storageMb: 32768, // 32 GB
      storageIops: 360, // Storage IOPS
      version: "18", // PostgreSQL 18
      // Backup configuration
      backupRetentionDays: 7,
      geoRedundantBackupEnabled: false,
      // High Availability
      zone: "1",
      highAvailabilityMode: "ZoneRedundant", // "ZoneRedundant" or "SameZone" or undefined (single server)
      standbyAvailabilityZone: "2",
      // Networking
      publicNetworkAccessEnabled: false, // VNet integration only
      // Labels
      tags: {
        Environment: "Dev",
        Owner: "TeamB",
        Database: "PostgreSQL",
      },
      // DNS CNAME record name registered in azure.inner private zone
      cnameRecordName: "postgres-prod",
      configurationParametersFile:
        "config/azure/azuredatabase/postgres-parameters.ts",
    },
  ],
};
