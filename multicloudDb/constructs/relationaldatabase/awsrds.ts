import { DataAwsSecretsmanagerSecretVersion } from "@cdktf/provider-aws/lib/data-aws-secretsmanager-secret-version";
import { DbInstance } from "@cdktf/provider-aws/lib/db-instance";
import { DbOptionGroup } from "@cdktf/provider-aws/lib/db-option-group";
import { DbParameterGroup } from "@cdktf/provider-aws/lib/db-parameter-group";
import { DbSubnetGroup } from "@cdktf/provider-aws/lib/db-subnet-group";
import { IamRole } from "@cdktf/provider-aws/lib/iam-role";
import { IamRolePolicyAttachment } from "@cdktf/provider-aws/lib/iam-role-policy-attachment";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { Construct } from "constructs";
import * as path from "path";

export interface RdsInstanceConfig {
  identifier: string;
  instanceClass: string;
  engine: string;
  engineVersion: string;
  allocatedStorage: number;
  storageType: string;
  username?: string;
  password?: string;
  passwordSecretKey?: string;
  manageMasterUserPassword?: boolean;
  subnetKeys: string[];
  vpcSecurityGroupNames: string[];
  dbSubnetGroupName?: string; // Use existing subnet group
  parameterGroupName?: string;
  parameterGroupFamily?: string;
  parameterGroupParametersFile?: string; // Path to parameter file
  optionGroupName?: string;
  optionGroupOptionsFile?: string; // Path to option file
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
  monitoringRoleArn?: string;
  createMonitoringRole?: boolean; // Auto-create monitoring role
  // Logs
  enabledCloudwatchLogsExports?: string[];
  // Auto upgrade
  autoMinorVersionUpgrade?: boolean;
  // Maintenance
  preferredMaintenanceWindow?: string;
  // Multi-AZ and Read Replica
  multiAz?: boolean;
  replicateSourceDb?: string; // For read replica
  storageEncrypted?: boolean; // Enable storage encryption
  tags?: { [key: string]: string };
  build: boolean;
}

export interface RdsInstanceOutput { // Export RdsInstanceOutput
  dbInstance: DbInstance;
  masterUserSecretArn?: string;
}

interface CreateRdsInstancesParams {
  instanceConfigs: RdsInstanceConfig[];
  subnets: Record<string, { id: string; name: string }>;
  securityGroups: Record<string, any>;
}

export function createAwsRdsInstances(
  scope: Construct,
  provider: AwsProvider,
  params: CreateRdsInstancesParams
): RdsInstanceOutput[] {
  const instances = params.instanceConfigs
    .filter((config) => config.build)
    .map((config) => {
    const subnetIds = config.subnetKeys.map((key) => {
      const subnet = params.subnets[key];
      if (!subnet) {
        throw new Error(`Subnet with key ${key} not found for RDS Instance ${config.identifier}`);
      }
      return subnet.id;
    });

    // Use existing subnet group or create new one
    let dbSubnetGroupName = config.dbSubnetGroupName;
    if (!dbSubnetGroupName) {
      const dbSubnetGroup = new DbSubnetGroup(scope, `rds-subnet-group-${config.identifier}`, {
        provider: provider,
        name: `${config.identifier}-sng`,
        subnetIds: subnetIds,
        tags: config.tags,
      });
      dbSubnetGroupName = dbSubnetGroup.name;
    }

    const securityGroupIds = config.vpcSecurityGroupNames.map((name) => {
      const sgId = params.securityGroups[name];
      if (!sgId) {
        throw new Error(`Security Group with name ${name} not found for RDS Instance ${config.identifier}`);
      }
      return sgId;
    });

    // Create monitoring role if needed
    let monitoringRoleArn = config.monitoringRoleArn;
    if (config.enableEnhancedMonitoring && config.createMonitoringRole && !monitoringRoleArn) {
      const monitoringRole = new IamRole(scope, `rds-monitoring-role-${config.identifier}`, {
        name: `${config.identifier}-monitoring-role`,
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Service: "monitoring.rds.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            },
          ],
        }),
        tags: config.tags,
      });

      new IamRolePolicyAttachment(scope, `rds-monitoring-policy-${config.identifier}`, {
        role: monitoringRole.name,
        policyArn: "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole",
      });

      monitoringRoleArn = monitoringRole.arn;
    }

    let parameterGroupName = config.parameterGroupName;
    if (!parameterGroupName && config.parameterGroupFamily) {
        // Load parameters from file if specified
        let parameters = undefined;
        if (config.parameterGroupParametersFile) {
          const absolutePath = path.resolve(process.cwd(), config.parameterGroupParametersFile);
          const paramModule = require(absolutePath);
          // Support both default export and named export
          parameters = paramModule.default || paramModule[Object.keys(paramModule)[0]];
        }
        
        const paramGroup = new DbParameterGroup(scope, `rds-param-group-${config.identifier}`, {
            name: `${config.identifier}-pg`,
            family: config.parameterGroupFamily,
            parameter: parameters,
            tags: config.tags,
        });
        parameterGroupName = paramGroup.name;
    }

    let optionGroupName = config.optionGroupName;
    if (!optionGroupName) {
        // Load options from file if specified
        let options = undefined;
        if (config.optionGroupOptionsFile) {
          const absolutePath = path.resolve(process.cwd(), config.optionGroupOptionsFile);
          const optionModule = require(absolutePath);
          // Support both default export and named export
          options = optionModule.default || optionModule[Object.keys(optionModule)[0]];
        }
        
        // Get major version for option group
        let majorVersion: string;
        if (config.engine === 'postgres') {
            // For PostgreSQL, only the major version is allowed for option groups
            majorVersion = config.engineVersion.split('.')[0];
        } else if (config.engine === 'mysql' || config.engine === 'mariadb') {
            // For MySQL/MariaDB, use major.minor if available, otherwise major
            const parts = config.engineVersion.split('.');
            if (parts.length >= 2) {
                majorVersion = `${parts[0]}.${parts[1]}`;
            } else {
                majorVersion = parts[0];
            }
        } else {
            // Default to major version if engine not explicitly handled
            majorVersion = config.engineVersion.split('.')[0];
        }
        
        const optionGroup = new DbOptionGroup(scope, `rds-option-group-${config.identifier}`, {
            name: `${config.identifier}-og`,
            engineName: config.engine,
            majorEngineVersion: majorVersion,
            option: options,
            tags: config.tags,
        });
        optionGroupName = optionGroup.name;
    }

    const dbInstanceProps: any = {
      provider: provider,
      identifier: config.identifier,
      instanceClass: config.instanceClass,
      engine: config.engine,
      engineVersion: config.engineVersion,
      allocatedStorage: config.allocatedStorage,
      storageType: config.storageType,
      username: config.username,
      dbSubnetGroupName: dbSubnetGroupName,
      vpcSecurityGroupIds: securityGroupIds,
      parameterGroupName: parameterGroupName,
      optionGroupName: optionGroupName,
      skipFinalSnapshot: config.skipFinalSnapshot,
      tags: config.tags,
      // Backup
      backupRetentionPeriod: config.backupRetentionPeriod !== undefined ? config.backupRetentionPeriod : 7,
      preferredBackupWindow: config.preferredBackupWindow,
      // Performance Insights
      performanceInsightsEnabled: config.enablePerformanceInsights,
      performanceInsightsRetentionPeriod: config.performanceInsightsRetentionPeriod,
      // Enhanced Monitoring
      monitoringInterval: config.enableEnhancedMonitoring ? (config.monitoringInterval || 60) : 0,
      monitoringRoleArn: config.enableEnhancedMonitoring ? monitoringRoleArn : undefined,
      // Logs
      enabledCloudwatchLogsExports: config.enabledCloudwatchLogsExports,
      // Auto upgrade
      autoMinorVersionUpgrade: config.autoMinorVersionUpgrade !== undefined ? config.autoMinorVersionUpgrade : true,
      // Maintenance
      preferredMaintenanceWindow: config.preferredMaintenanceWindow,
      // Multi-AZ and Read Replica
      multiAz: config.multiAz,
      replicateSourceDb: config.replicateSourceDb,
      storageEncrypted: config.storageEncrypted,
      // Password management logic
      ...(() => {
        if (config.manageMasterUserPassword) {
          return { manageMasterUserPassword: true };
        }
        if (config.passwordSecretKey) {
          const dbPasswordSecret = new DataAwsSecretsmanagerSecretVersion(scope, `rds-password-secret-${config.identifier}`, {
            secretId: config.passwordSecretKey,
          });
          return { password: dbPasswordSecret.secretString };
        }
        return { password: config.password };
      })(),
    };

    const dbInstance = new DbInstance(scope, `rdsInstance-${config.identifier}`, dbInstanceProps);

    // If manageMasterUserPassword is true, capture the secret ARN
    let masterUserSecretArn: string | undefined = undefined;
    if (config.manageMasterUserPassword && dbInstance.masterUserSecret) {
      // Access the ARN using get(0) and then secretArn property
      masterUserSecretArn = dbInstance.masterUserSecret.get(0).secretArn;
    }

    return {
      dbInstance: dbInstance,
      masterUserSecretArn: masterUserSecretArn,
    };
  });

  return instances;
}
