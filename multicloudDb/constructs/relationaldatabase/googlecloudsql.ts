import { ComputeNetwork as GoogleVpc } from "@cdktn/provider-google/lib/compute-network";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { ServiceNetworkingConnection } from "@cdktn/provider-google/lib/service-networking-connection";
import { SqlDatabase } from "@cdktn/provider-google/lib/sql-database";
import { SqlDatabaseInstance } from "@cdktn/provider-google/lib/sql-database-instance";
import { SqlUser } from "@cdktn/provider-google/lib/sql-user";
import { Construct } from "constructs";
import * as path from "path";

export interface CloudSqlConfig {
  project: string;
  name: string;
  databaseVersion: string;
  edition: string;
  tier: string;
  region: string;
  availabilityType: string;
  diskType: string;
  diskSize: number;
  diskAutoresize: boolean;
  diskAutoresizeLimit: number;
  username: string;
  password?: string;
  managedPasswordEnabled: boolean;
  privateNetwork: boolean;
  authorizedNetworks: string[];
  // Backup configuration
  backupEnabled: boolean;
  backupStartTime: string;
  backupRetainedBackups: number;
  backupTransactionLogRetentionDays: number;
  // Point-in-time recovery
  pointInTimeRecoveryEnabled?: boolean;
  binaryLogEnabled?: boolean;
  // Maintenance window
  maintenanceWindowDay: number;
  maintenanceWindowHour: number;
  maintenanceUpdateTrack: string;
  // High availability
  highAvailabilityEnabled: boolean;
  // Insights and monitoring
  insightsEnabled: boolean;
  queryStringLength: number;
  recordApplicationTags: boolean;
  recordClientAddress: boolean;
  // Deletion protection
  deletionProtection: boolean;
  // Labels
  labels: {
    [key: string]: string;
  };
  databaseFlagsFile?: string;
  build: boolean;
}

export interface DatabaseFlag {
  name: string;
  value: string;
}

export interface CloudSqlOutput {
  sqlInstance: SqlDatabaseInstance;
  sqlDatabase?: SqlDatabase;
  sqlUser?: SqlUser;
  privateIpAddress?: string;
  connectionName: string;
}

export function createGoogleCloudSqlInstance(
  scope: Construct,
  provider: GoogleProvider,
  config: CloudSqlConfig,
  vpc: GoogleVpc,
  serviceNetworkingConnection: ServiceNetworkingConnection,
  id: string // Use a string identifier for construct IDs
): CloudSqlOutput {
  // Load database flags from file if specified
  let databaseFlags: DatabaseFlag[] = [];
  if (config.databaseFlagsFile) {
    try {
      const absolutePath = path.resolve(
        process.cwd(),
        config.databaseFlagsFile
      );
      const paramModule = require(absolutePath);
      // Support both default export and named export
      databaseFlags =
        paramModule.default || paramModule[Object.keys(paramModule)[0]];
    } catch (error) {
      console.error(
        `Error reading database flags file at ${config.databaseFlagsFile}:`,
        error
      );
    }
  }

  // Create SQL Database Instance
  const sqlInstanceProps: any = {
    provider: provider,
    project: config.project,
    name: config.name,
    databaseVersion: config.databaseVersion,
    edition: config.edition, // Pass the edition to the SQL instance
    region: config.region,
    deletionProtection: config.deletionProtection,
    settings: {
      tier: config.tier,
      availabilityType: config.availabilityType,
      diskType: config.diskType,
      diskSize: config.diskSize,
      diskAutoresize: config.diskAutoresize,
      diskAutoresizeLimit: config.diskAutoresizeLimit,
      // Backup configuration
      backupConfiguration: {
        enabled: config.backupEnabled,
        startTime: config.backupStartTime,
        backupRetentionSettings: {
          retainedBackups: config.backupRetainedBackups,
          retentionUnit: "COUNT",
        },
        transactionLogRetentionDays: config.backupTransactionLogRetentionDays,
        pointInTimeRecoveryEnabled: config.databaseVersion.startsWith(
          "POSTGRES"
        )
          ? config.pointInTimeRecoveryEnabled
          : undefined,
        binaryLogEnabled: config.databaseVersion.startsWith("MYSQL")
          ? config.binaryLogEnabled
          : undefined,
      },
      // IP configuration
      ipConfiguration: {
        ipv4Enabled: !config.privateNetwork,
        privateNetwork: config.privateNetwork ? vpc.id : undefined,
        authorizedNetworks: config.authorizedNetworks.map((network) => ({
          value: network,
        })),
        requireSsl: true,
      },
      // Maintenance window
      maintenanceWindow: {
        day: config.maintenanceWindowDay,
        hour: config.maintenanceWindowHour,
        updateTrack: config.maintenanceUpdateTrack,
      },
      // Database flags
      databaseFlags: databaseFlags.map((flag) => ({
        name: flag.name,
        value: flag.value,
      })),
      // Insights configuration
      insightsConfig: config.insightsEnabled
        ? {
            queryInsightsEnabled: true,
            queryStringLength: config.queryStringLength,
            recordApplicationTags: config.recordApplicationTags,
            recordClientAddress: config.recordClientAddress,
          }
        : undefined,
      // Labels
      userLabels: config.labels,
    },
  };

  // Create SQL instance with proper dependencies for private network
  const sqlInstance = new SqlDatabaseInstance(
    scope,
    `cloudsql-instance-${id}`,
    {
      // Use id for construct ID
      ...sqlInstanceProps,
      // ServiceNetworkingConnection
      dependsOn: config.privateNetwork
        ? [vpc, serviceNetworkingConnection]
        : [vpc],
      lifecycle: {
        createBeforeDestroy: true,
      },
    }
  );

  // Create default database
  const databaseName = config.databaseVersion.startsWith("MYSQL")
    ? "mysql_db"
    : "postgres_db";
  const sqlDatabase = new SqlDatabase(scope, `cloudsql-database-${id}`, {
    // Use id for construct ID
    provider: provider,
    project: config.project,
    name: databaseName,
    instance: sqlInstance.name,
  });

  // Create database user
  let sqlUser: SqlUser | undefined = undefined;
  if (!config.managedPasswordEnabled) {
    sqlUser = new SqlUser(scope, `cloudsql-user-${id}`, {
      // Use id for construct ID
      provider: provider,
      project: config.project,
      name: config.username,
      instance: sqlInstance.name,
      password: config.password,
    });
  }

  return {
    sqlInstance: sqlInstance,
    sqlDatabase: sqlDatabase,
    sqlUser: sqlUser,
    connectionName: sqlInstance.connectionName,
  };
}
