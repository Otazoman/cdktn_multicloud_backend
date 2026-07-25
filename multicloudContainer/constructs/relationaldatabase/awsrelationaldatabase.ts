import { DataAwsSecretsmanagerSecretVersion } from "@cdktn/provider-aws/lib/data-aws-secretsmanager-secret-version";
import {
  DbInstance,
  DbInstanceConfig,
} from "@cdktn/provider-aws/lib/db-instance";
import { DbOptionGroup } from "@cdktn/provider-aws/lib/db-option-group";
import { DbParameterGroup } from "@cdktn/provider-aws/lib/db-parameter-group";
import { DbSubnetGroup } from "@cdktn/provider-aws/lib/db-subnet-group";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { RdsCluster } from "@cdktn/provider-aws/lib/rds-cluster";
import { RdsClusterInstance } from "@cdktn/provider-aws/lib/rds-cluster-instance";
import { RdsClusterParameterGroup } from "@cdktn/provider-aws/lib/rds-cluster-parameter-group";
import { Construct } from "constructs";
import * as path from "path";

export function getMasterUserSecretArn(
  masterUserSecretList: any,
): string | undefined {
  if (masterUserSecretList && masterUserSecretList.get(0)) {
    return masterUserSecretList.get(0).secretArn;
  }
  return undefined;
}

export type AwsRelationalDatabaseType = "aurora" | "rds";

export interface AwsRelationalDatabaseConfig {
  type: AwsRelationalDatabaseType;
  // Common properties
  identifier: string; // clusterIdentifier for Aurora, identifier for RDS
  engine: string;
  engineVersion: string;
  masterUsername?: string;
  password?: string;
  masterPasswordSecretKey?: string;
  manageMasterUserPassword?: boolean;
  // Migration support - prevents output generation during password management transitions
  suppressSecretOutput?: boolean;
  subnetKeys: string[];
  vpcSecurityGroupNames: string[];
  dbSubnetGroupName?: string; // Use existing subnet group
  skipFinalSnapshot: boolean;
  // Backup
  backupRetentionPeriod?: number;
  preferredBackupWindow?: string;
  // Performance Insights
  enablePerformanceInsights?: boolean;
  performanceInsightsRetentionPeriod?: number;
  // Enhanced Monitoring
  enableEnhancedMonitoring?: boolean;
  monitoringInterval?: number;
  // Auto upgrade
  autoMinorVersionUpgrade?: boolean;
  // Maintenance
  preferredMaintenanceWindow?: string;
  storageEncrypted?: boolean; // Enable storage encryption
  tags?: { [key: string]: string };

  // RDS specific properties
  allocatedStorage?: number;
  storageType?: string;
  parameterGroupName?: string;
  parameterGroupFamily?: string;
  parameterGroupParametersFile?: string; // Path to parameter file
  optionGroupName?: string;
  optionGroupOptionsFile?: string; // Path to option file
  multiAz?: boolean;
  replicateSourceDb?: string; // For read replica

  // Aurora specific properties
  instanceClass: string; // For Aurora cluster instances
  instanceCount?: number; // For Aurora cluster instances
  dbClusterParameterGroupName?: string;
  dbClusterParameterGroupFamily?: string;
  dbClusterParameterGroupParametersFile?: string; // Path to cluster parameter file
  instanceParameterGroupName?: string;
  instanceParameterGroupFamily?: string;
  instanceParameterGroupParametersFile?: string; // Path to instance parameter file
  instancePreferredMaintenanceWindow?: string; // For Aurora instance maintenance
  build?: boolean; // Add build flag back for databaseResources.ts to filter

  // --- Externalized Security and Logging Configurations ---
  // IAM Role ARN for RDS Enhanced Monitoring supplied externally
  monitoringRoleArn?: string;
  // CloudWatch Logs export types managed externally (e.g., ["error", "general", "slowquery"])
  enabledCloudwatchLogsExports?: string[];
}

export interface AwsRelationalDatabaseOutput {
  rdsCluster?: RdsCluster;
  dbInstance?: DbInstance;
}

interface CreateAwsRelationalDatabasesParams {
  databaseConfigs: AwsRelationalDatabaseConfig[];
  subnets: Record<string, { id: string; name: string }>;
  securityGroups: Record<string, any>;
}

/**
 * Loads parameters from a configuration file path.
 * @param filePath Path to the parameter file.
 * @returns Loaded parameters object.
 */
function loadParametersFromFile(filePath: string): any {
  const absolutePath = path.resolve(process.cwd(), filePath);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const paramModule = require(absolutePath);
  return paramModule.default || paramModule[Object.keys(paramModule)[0]];
}

/**
 * Gets the master password based on configuration (Secret Manager, direct value, or managed).
 * @param scope The construct scope.
 * @param config The database configuration.
 * @param type The database type ("rds" or "aurora").
 * @returns An object containing the password (or `manageMasterUserPassword` flag) and the Secret ARN.
 */
function getMasterPasswordProps(
  scope: Construct,
  config: AwsRelationalDatabaseConfig,
  type: AwsRelationalDatabaseType,
): {
  password?: string;
  masterUserSecretArn?: string;
  manageMasterUserPassword?: boolean;
} {
  if (config.manageMasterUserPassword) {
    return { manageMasterUserPassword: true };
  } else if (config.masterPasswordSecretKey) {
    const dbPasswordSecret = new DataAwsSecretsmanagerSecretVersion(
      scope,
      `${type}-password-secret-${config.identifier}`,
      {
        secretId: config.masterPasswordSecretKey,
      },
    );
    return {
      password: dbPasswordSecret.secretString,
      masterUserSecretArn: dbPasswordSecret.secretId,
    };
  } else {
    return {
      password: config.password,
    };
  }
}

/**
 * Creates an Aurora cluster and its instances.
 */
function createAuroraCluster(
  scope: Construct,
  provider: AwsProvider,
  config: AwsRelationalDatabaseConfig,
  dbSubnetGroupName: string,
  securityGroupIds: string[],
): AwsRelationalDatabaseOutput {
  // 1. Cluster Parameter Group
  let dbClusterParameterGroupName = config.dbClusterParameterGroupName;
  if (!dbClusterParameterGroupName && config.dbClusterParameterGroupFamily) {
    const clusterParameters = config.dbClusterParameterGroupParametersFile
      ? loadParametersFromFile(config.dbClusterParameterGroupParametersFile)
      : undefined;

    const sanitizedIdentifier = config.identifier.replace(/[^a-zA-Z0-9]/g, "-");
    const clusterPg = new RdsClusterParameterGroup(
      scope,
      `aurora-cluster-pg-${sanitizedIdentifier}`,
      {
        name: `${sanitizedIdentifier}-cpg`,
        family: config.dbClusterParameterGroupFamily,
        parameter: clusterParameters,
        tags: config.tags,
      },
    );
    dbClusterParameterGroupName = clusterPg.name;
  }

  // 2. Instance Parameter Group
  let instanceParameterGroupName = config.instanceParameterGroupName;
  if (!instanceParameterGroupName && config.instanceParameterGroupFamily) {
    const instanceParameters = config.instanceParameterGroupParametersFile
      ? loadParametersFromFile(config.instanceParameterGroupParametersFile)
      : undefined;

    const sanitizedIdentifier = config.identifier.replace(/[^a-zA-Z0-9]/g, "-");
    const instancePg = new DbParameterGroup(
      scope,
      `aurora-instance-pg-${sanitizedIdentifier}`,
      {
        name: `${sanitizedIdentifier}-ipg`,
        family: config.instanceParameterGroupFamily,
        parameter: instanceParameters,
        tags: config.tags,
      },
    );
    instanceParameterGroupName = instancePg.name;
  }

  // 3. Password handling for Cluster
  const passwordProps = getMasterPasswordProps(scope, config, "aurora");

  // 4. Create RdsCluster
  const cluster = new RdsCluster(scope, `auroraCluster-${config.identifier}`, {
    provider: provider,
    clusterIdentifier: config.identifier,
    engine: config.engine,
    engineVersion: config.engineVersion,
    masterUsername: config.masterUsername,
    masterPassword: passwordProps.password,
    dbSubnetGroupName: dbSubnetGroupName,
    vpcSecurityGroupIds: securityGroupIds,
    dbClusterParameterGroupName: dbClusterParameterGroupName,
    skipFinalSnapshot: config.skipFinalSnapshot,
    tags: config.tags,
    backupRetentionPeriod: config.backupRetentionPeriod ?? 7,
    preferredBackupWindow: config.preferredBackupWindow,
    // Assign logs configuration from config parameters
    enabledCloudwatchLogsExports: config.enabledCloudwatchLogsExports,
    allowMajorVersionUpgrade: false,
    preferredMaintenanceWindow: config.preferredMaintenanceWindow,
    storageEncrypted: config.storageEncrypted,
    manageMasterUserPassword: passwordProps.manageMasterUserPassword,
  });

  // 5. Create RdsClusterInstances
  for (let i = 1; i <= (config.instanceCount || 1); i++) {
    new RdsClusterInstance(scope, `auroraInstance-${config.identifier}-${i}`, {
      provider: provider,
      identifier: `${config.identifier}-instance-${i}`,
      clusterIdentifier: cluster.clusterIdentifier,
      instanceClass: config.instanceClass,
      engine: config.engine,
      engineVersion: config.engineVersion,
      dbParameterGroupName: instanceParameterGroupName,
      tags: config.tags,
      performanceInsightsEnabled: config.enablePerformanceInsights,
      performanceInsightsRetentionPeriod:
        config.performanceInsightsRetentionPeriod,
      monitoringInterval: config.enableEnhancedMonitoring
        ? config.monitoringInterval ?? 60
        : 0,
      // Assign monitoring role ARN provided by the user config directly
      monitoringRoleArn: config.enableEnhancedMonitoring
        ? config.monitoringRoleArn
        : undefined,
      autoMinorVersionUpgrade: config.autoMinorVersionUpgrade ?? true,
      preferredMaintenanceWindow: config.instancePreferredMaintenanceWindow,
    });
  }

  return { rdsCluster: cluster };
}

/**
 * Creates a standard RDS DB Instance.
 */
function createRdsInstance(
  scope: Construct,
  provider: AwsProvider,
  config: AwsRelationalDatabaseConfig,
  dbSubnetGroupName: string,
  securityGroupIds: string[],
): AwsRelationalDatabaseOutput {
  // 1. DB Parameter Group
  let parameterGroupName = config.parameterGroupName;
  if (!parameterGroupName && config.parameterGroupFamily) {
    const parameters = config.parameterGroupParametersFile
      ? loadParametersFromFile(config.parameterGroupParametersFile)
      : undefined;

    const paramGroup = new DbParameterGroup(
      scope,
      `rds-param-group-${config.identifier}`,
      {
        name: `${config.identifier}-pg`,
        family: config.parameterGroupFamily,
        parameter: parameters,
        tags: config.tags,
      },
    );
    parameterGroupName = paramGroup.name;
  }

  // 2. DB Option Group
  let optionGroupName = config.optionGroupName;
  if (!optionGroupName) {
    const options = config.optionGroupOptionsFile
      ? loadParametersFromFile(config.optionGroupOptionsFile)
      : undefined;

    let majorVersion: string;
    if (config.engine === "postgres") {
      majorVersion = config.engineVersion.split(".")[0];
    } else if (config.engine === "mysql" || config.engine === "mariadb") {
      const parts = config.engineVersion.split(".");
      majorVersion = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
    } else {
      majorVersion = config.engineVersion.split(".")[0];
    }

    const optionGroup = new DbOptionGroup(
      scope,
      `rds-option-group-${config.identifier}`,
      {
        name: `${config.identifier}-og`,
        engineName: config.engine,
        majorEngineVersion: majorVersion,
        option: options,
        tags: config.tags,
      },
    );
    optionGroupName = optionGroup.name;
  }

  // 3. Password handling
  const passwordProps = getMasterPasswordProps(scope, config, "rds");

  // 4. Create DbInstance
  const dbInstanceProps: DbInstanceConfig = {
    provider: provider,
    identifier: config.identifier,
    instanceClass: config.instanceClass,
    engine: config.engine,
    engineVersion: config.engineVersion,
    allocatedStorage: config.allocatedStorage,
    storageType: config.storageType,
    username: config.masterUsername,
    password: passwordProps.password,
    dbSubnetGroupName: dbSubnetGroupName,
    vpcSecurityGroupIds: securityGroupIds,
    parameterGroupName: parameterGroupName,
    optionGroupName: optionGroupName,
    skipFinalSnapshot: config.skipFinalSnapshot,
    tags: config.tags,
    backupRetentionPeriod: config.backupRetentionPeriod ?? 7,
    backupWindow: config.preferredBackupWindow,
    performanceInsightsEnabled: config.enablePerformanceInsights,
    performanceInsightsRetentionPeriod:
      config.performanceInsightsRetentionPeriod,
    monitoringInterval: config.enableEnhancedMonitoring
      ? config.monitoringInterval ?? 60
      : 0,
    // Assign monitoring role ARN provided by the user config directly
    monitoringRoleArn: config.enableEnhancedMonitoring
      ? config.monitoringRoleArn
      : undefined,
    // Assign logs configuration from config parameters
    enabledCloudwatchLogsExports: config.enabledCloudwatchLogsExports,
    autoMinorVersionUpgrade: config.autoMinorVersionUpgrade ?? true,
    maintenanceWindow: config.preferredMaintenanceWindow,
    multiAz: config.multiAz,
    replicateSourceDb: config.replicateSourceDb,
    storageEncrypted: config.storageEncrypted,
    manageMasterUserPassword: passwordProps.manageMasterUserPassword,
  };

  const dbInstance = new DbInstance(
    scope,
    `rdsInstance-${config.identifier}`,
    dbInstanceProps,
  );

  return { dbInstance: dbInstance };
}

/**
 * Creates AWS Relational Databases (RDS and Aurora) based on the provided configurations.
 * @param scope The construct scope.
 * @param provider The AWS provider.
 * @param params Configuration, subnets, and security groups.
 * @returns An array of AwsRelationalDatabaseOutput, which may contain an RdsCluster or DbInstance.
 */
export function createAwsRelationalDatabases(
  scope: Construct,
  provider: AwsProvider,
  params: CreateAwsRelationalDatabasesParams,
): AwsRelationalDatabaseOutput[] {
  return params.databaseConfigs.map((config, index) => {
    // Validate and get Subnet IDs
    const subnetIds = config.subnetKeys.map((key) => {
      const subnet = params.subnets[key];
      if (!subnet) {
        throw new Error(
          `Subnet with key ${key} not found for ${config.type} ${config.identifier}`,
        );
      }
      return subnet.id;
    });

    // Create or get DbSubnetGroup
    let dbSubnetGroupName = config.dbSubnetGroupName;
    if (!dbSubnetGroupName) {
      const sanitizedIdentifier = config.identifier.replace(
        /[^a-zA-Z0-9]/g,
        "-",
      );
      const dbSubnetGroup = new DbSubnetGroup(
        scope,
        `${config.type}-subnet-group-${sanitizedIdentifier}-${index}`,
        {
          provider: provider,
          name: `${sanitizedIdentifier}-sng`,
          subnetIds: subnetIds,
          tags: config.tags,
        },
      );
      dbSubnetGroupName = dbSubnetGroup.name;
    }

    // Validate and get Security Group IDs
    const securityGroupIds = config.vpcSecurityGroupNames.map((name) => {
      const sgId = params.securityGroups[name];
      if (!sgId) {
        throw new Error(
          `Security Group with name ${name} not found for ${config.type} ${config.identifier}`,
        );
      }
      return sgId;
    });

    // 2. Dispatch to specific creator function
    if (config.type === "aurora") {
      return createAuroraCluster(
        scope,
        provider,
        config,
        dbSubnetGroupName,
        securityGroupIds,
      );
    } else {
      return createRdsInstance(
        scope,
        provider,
        config,
        dbSubnetGroupName,
        securityGroupIds,
      );
    }
  });
}
