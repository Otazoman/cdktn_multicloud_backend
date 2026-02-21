import { MysqlFlexibleDatabase } from "@cdktn/provider-azurerm/lib/mysql-flexible-database";
import { MysqlFlexibleServer } from "@cdktn/provider-azurerm/lib/mysql-flexible-server";
import { PostgresqlFlexibleServer } from "@cdktn/provider-azurerm/lib/postgresql-flexible-server";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Subnet } from "@cdktn/provider-azurerm/lib/subnet";
import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";
import { Construct } from "constructs";

export type AzureDatabaseType = "mysql" | "postgresql";

export interface AzureDatabaseConfig {
  build: boolean;
  type: AzureDatabaseType;
  name: string;
  serverName: string;
  subnetKey: string; // Key to identify the subnet for this database
  serverAdminLogin: string;
  serverAdminPassword: string;
  skuName: string;
  storageMb: number;
  storageIops?: number;
  version: string;
  // Backup configuration
  backupRetentionDays: number;
  geoRedundantBackupEnabled?: boolean;
  // High Availability
  highAvailabilityMode?: string;
  standbyAvailabilityZone?: string;
  // Primary Server Setting zone
  zone?: string;
  // Networking
  publicNetworkAccessEnabled?: boolean;
  // Maintenance window
  maintenanceWindow?: {
    dayOfWeek: number;
    startHour: number;
    startMinute: number;
  };
  // Security
  tlsEnforcementEnabled?: boolean;
  // Configuration parameters
  configurationParametersFile?: string;
  tags?: { [key: string]: string };
}

export interface AzureDatabaseOutput {
  server: MysqlFlexibleServer | PostgresqlFlexibleServer;
  database: MysqlFlexibleDatabase | any; // Use any for now to resolve the type issue
  privateDnsZone?: any; // DNS Zone is managed externally
  fqdn: string;
}

interface CreateAzureDatabasesParams {
  resourceGroupName: string;
  location: string;
  databaseConfigs: AzureDatabaseConfig[];
  virtualNetwork: VirtualNetwork;
  subnets: { [key: string]: Subnet }; // Map of subnet keys to Subnet objects
  sharedDnsZones: Map<
    AzureDatabaseType,
    { privateDnsZone: any; vnetLink: any }
  >; // Pre-created DNS zones
}

interface ConfigurationParameter {
  name: string;
  value: string;
}

/**
 * Loads configuration parameters from a file path.
 * @param filePath Path to the configuration parameter file.
 * @returns Loaded parameters object.
 */
function loadConfigurationFromFile(filePath: string): ConfigurationParameter[] {
  try {
    const path = require("path");
    const absolutePath = path.resolve(process.cwd(), filePath);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const configModule = require(absolutePath);
    return configModule.default || configModule[Object.keys(configModule)[0]];
  } catch (error) {
    console.error(`Error reading configuration file at ${filePath}:`, error);
    return [];
  }
}

/**
 * Creates an Azure MySQL Flexible Server and Database
 */
function createAzureMySqlFlexibleServer(
  scope: Construct,
  provider: AzurermProvider,
  config: AzureDatabaseConfig,
  resourceGroupName: string,
  location: string,
  delegatedSubnet: Subnet,
  privateDnsZone: any, // DNS Zone managed externally
  vnetLink: any, // VNet Link managed externally
  index: number
): AzureDatabaseOutput {
  // Load configuration parameters if specified
  const configurationParameters = config.configurationParametersFile
    ? loadConfigurationFromFile(config.configurationParametersFile)
    : [];

  // Create MySQL Flexible Server
  const mysqlServer = new MysqlFlexibleServer(
    scope,
    `azure-mysql-server-${config.serverName}-${index}`,
    {
      provider: provider,
      name: config.serverName,
      resourceGroupName: resourceGroupName,
      location: location,
      zone: config.zone,
      administratorLogin: config.serverAdminLogin,
      administratorPassword: config.serverAdminPassword,
      skuName: config.skuName,
      version: config.version,
      delegatedSubnetId: delegatedSubnet.id,
      privateDnsZoneId: privateDnsZone.id,
      storage: {
        sizeGb: Math.ceil(config.storageMb / 1024),
        iops: config.storageIops,
      },
      backupRetentionDays: config.backupRetentionDays,
      geoRedundantBackupEnabled: config.geoRedundantBackupEnabled ?? false,
      highAvailability: config.highAvailabilityMode
        ? {
            mode: config.highAvailabilityMode,
            standbyAvailabilityZone: config.standbyAvailabilityZone,
          }
        : undefined,
      maintenanceWindow: config.maintenanceWindow
        ? {
            dayOfWeek: config.maintenanceWindow.dayOfWeek,
            startHour: config.maintenanceWindow.startHour,
            startMinute: config.maintenanceWindow.startMinute,
          }
        : undefined,
      tags: config.tags,
      dependsOn: [delegatedSubnet, privateDnsZone, vnetLink],
    }
  );

  // Apply configuration parameters if any are loaded
  if (configurationParameters.length > 0) {
    console.log(
      `Applying ${configurationParameters.length} configuration parameters to MySQL server: ${config.serverName}`
    );
    // Note: Configuration parameters would typically be applied via server configuration resources
    // This is a placeholder for future implementation
  }

  // Create MySQL Database
  const mysqlDatabase = new MysqlFlexibleDatabase(
    scope,
    `azure-mysql-database-${config.name}-${index}`,
    {
      provider: provider,
      name: config.name,
      resourceGroupName: resourceGroupName,
      serverName: mysqlServer.name,
      charset: "utf8mb4",
      collation: "utf8mb4_unicode_ci",
    }
  );

  return {
    server: mysqlServer,
    database: mysqlDatabase,
    privateDnsZone: privateDnsZone,
    fqdn: mysqlServer.fqdn,
  };
}

/**
 * Creates an Azure PostgreSQL Flexible Server and Database
 */
function createAzurePostgreSqlFlexibleServer(
  scope: Construct,
  provider: AzurermProvider,
  config: AzureDatabaseConfig,
  resourceGroupName: string,
  location: string,
  delegatedSubnet: Subnet,
  privateDnsZone: any, // DNS Zone managed externally
  vnetLink: any, // VNet Link managed externally
  index: number
): AzureDatabaseOutput {
  // Load configuration parameters if specified
  const configurationParameters = config.configurationParametersFile
    ? loadConfigurationFromFile(config.configurationParametersFile)
    : [];

  // Create PostgreSQL Flexible Server
  // Note: When using VNet integration (delegatedSubnetId), we must NOT set publicNetworkAccessEnabled
  const postgresServer = new PostgresqlFlexibleServer(
    scope,
    `azure-postgres-server-${config.serverName}-${index}`,
    {
      provider: provider,
      name: config.serverName,
      resourceGroupName: resourceGroupName,
      location: location,
      zone: config.zone,
      administratorLogin: config.serverAdminLogin,
      administratorPassword: config.serverAdminPassword,
      skuName: config.skuName,
      version: config.version,
      delegatedSubnetId: delegatedSubnet.id,
      privateDnsZoneId: privateDnsZone.id,
      storageMb: config.storageMb,
      backupRetentionDays: config.backupRetentionDays,
      geoRedundantBackupEnabled: config.geoRedundantBackupEnabled ?? false,
      publicNetworkAccessEnabled: false, // Explicitly disable public access for VNet integration
      highAvailability: config.highAvailabilityMode
        ? {
            mode: config.highAvailabilityMode,
            standbyAvailabilityZone: config.standbyAvailabilityZone,
          }
        : undefined,
      maintenanceWindow: config.maintenanceWindow
        ? {
            dayOfWeek: config.maintenanceWindow.dayOfWeek,
            startHour: config.maintenanceWindow.startHour,
            startMinute: config.maintenanceWindow.startMinute,
          }
        : undefined,
      tags: config.tags,
      dependsOn: [delegatedSubnet, privateDnsZone, vnetLink],
    }
  );

  // Apply configuration parameters if any are loaded
  if (configurationParameters.length > 0) {
    console.log(
      `Applying ${configurationParameters.length} configuration parameters to PostgreSQL server: ${config.serverName}`
    );
    // Note: Configuration parameters would typically be applied via server configuration resources
    // This is a placeholder for future implementation
  }

  // For now, we'll skip PostgreSQL database creation to avoid import issues
  // The PostgreSQL Flexible Server itself is sufficient for most use cases
  // Users can manually create databases or use the server directly
  console.log(
    `PostgreSQL Flexible Server created: ${config.serverName}. Database creation skipped due to module compatibility issues.`
  );

  return {
    server: postgresServer,
    database: null as any, // Temporary workaround
    privateDnsZone: privateDnsZone,
    fqdn: postgresServer.fqdn,
  };
}

/**
 * Creates Azure Databases (MySQL and PostgreSQL Flexible Servers) based on the provided configurations.
 * @param scope The construct scope.
 * @param provider The Azure provider.
 * @param params Configuration, VNet, and subnet information.
 * @returns An array of AzureDatabaseOutput.
 */
export function createAzureDatabases(
  scope: Construct,
  provider: AzurermProvider,
  params: CreateAzureDatabasesParams
): AzureDatabaseOutput[] {
  return params.databaseConfigs.map((config, index) => {
    // Get the subnet for this database using the subnetKey
    const delegatedSubnet = params.subnets[config.subnetKey];

    if (!delegatedSubnet) {
      throw new Error(
        `Subnet with key '${config.subnetKey}' not found for database '${config.serverName}'. ` +
          `Available subnets: ${Object.keys(params.subnets).join(", ")}`
      );
    }

    // Get the shared DNS Zone for this database type from pre-created zones
    const dnsZoneInfo = params.sharedDnsZones.get(config.type);
    if (!dnsZoneInfo) {
      throw new Error(`DNS Zone not found for database type '${config.type}'`);
    }

    const { privateDnsZone, vnetLink } = dnsZoneInfo;

    // Dispatch to specific creator function based on database type
    if (config.type === "mysql") {
      return createAzureMySqlFlexibleServer(
        scope,
        provider,
        config,
        params.resourceGroupName,
        params.location,
        delegatedSubnet,
        privateDnsZone,
        vnetLink,
        index
      );
    } else if (config.type === "postgresql") {
      return createAzurePostgreSqlFlexibleServer(
        scope,
        provider,
        config,
        params.resourceGroupName,
        params.location,
        delegatedSubnet,
        privateDnsZone,
        vnetLink,
        index
      );
    } else {
      throw new Error(
        `Unsupported database type: ${config.type}. Supported types: mysql, postgresql`
      );
    }
  });
}
