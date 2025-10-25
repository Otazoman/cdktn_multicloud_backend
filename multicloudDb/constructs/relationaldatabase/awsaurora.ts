import { DataAwsSecretsmanagerSecretVersion } from "@cdktf/provider-aws/lib/data-aws-secretsmanager-secret-version";
import { DbParameterGroup } from "@cdktf/provider-aws/lib/db-parameter-group";
import { DbSubnetGroup } from "@cdktf/provider-aws/lib/db-subnet-group";
import { IamRole } from "@cdktf/provider-aws/lib/iam-role";
import { IamRolePolicyAttachment } from "@cdktf/provider-aws/lib/iam-role-policy-attachment";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { RdsCluster } from "@cdktf/provider-aws/lib/rds-cluster";
import { RdsClusterInstance } from "@cdktf/provider-aws/lib/rds-cluster-instance";
import { RdsClusterParameterGroup } from "@cdktf/provider-aws/lib/rds-cluster-parameter-group";
import { Construct } from "constructs";
import * as path from "path";

export interface AuroraClusterConfig {
  clusterIdentifier: string;
  engine: string;
  engineVersion: string;
  masterUsername?: string;
  masterPassword?: string;
  masterPasswordSecretKey?: string;
  manageMasterUserPassword?: boolean;
  subnetKeys: string[];
  vpcSecurityGroupNames: string[];
  dbSubnetGroupName?: string; // Use existing subnet group
  dbClusterParameterGroupName?: string;
  dbClusterParameterGroupFamily?: string;
  dbClusterParameterGroupParametersFile?: string; // Path to cluster parameter file
  skipFinalSnapshot: boolean;
  instanceClass: string;
  instanceCount: number;
  instanceParameterGroupName?: string;
  instanceParameterGroupFamily?: string;
  instanceParameterGroupParametersFile?: string; // Path to instance parameter file
  // Backup
  backupRetentionPeriod?: number;
  preferredBackupWindow?: string;
  // Performance Insights (instance level)
  enablePerformanceInsights?: boolean;
  performanceInsightsRetentionPeriod?: number;
  // Enhanced Monitoring (instance level)
  enableEnhancedMonitoring?: boolean;
  monitoringInterval?: number;
  monitoringRoleArn?: string;
  createMonitoringRole?: boolean; // Auto-create monitoring role
  // Logs (cluster level)
  enabledCloudwatchLogsExports?: string[];
  // Auto upgrade (cluster level)
  autoMinorVersionUpgrade?: boolean;
  // Maintenance (cluster level)
  preferredMaintenanceWindow?: string;
  // Instance maintenance
  instancePreferredMaintenanceWindow?: string;
  storageEncrypted?: boolean; // Enable storage encryption
  tags?: { [key: string]: string };
  build: boolean;
}

export interface AuroraClusterOutput { // Export AuroraClusterOutput
  rdsCluster: RdsCluster;
  masterUserSecretArn?: string;
}

interface CreateAuroraClustersParams {
  clusterConfigs: AuroraClusterConfig[];
  subnets: Record<string, { id: string; name: string }>;
  securityGroups: Record<string, any>;
}

export function createAwsAuroraClusters(
  scope: Construct,
  provider: AwsProvider,
  params: CreateAuroraClustersParams
): AuroraClusterOutput[] {
  const clusters = params.clusterConfigs
    .filter((config) => config.build)
    .map((config) => {
    const subnetIds = config.subnetKeys.map((key) => {
      const subnet = params.subnets[key];
      if (!subnet) {
        throw new Error(`Subnet with key ${key} not found for Aurora Cluster ${config.clusterIdentifier}`);
      }
      return subnet.id;
    });

    // Use existing subnet group or create new one
    let dbSubnetGroupName = config.dbSubnetGroupName;
    if (!dbSubnetGroupName) {
      const dbSubnetGroup = new DbSubnetGroup(scope, `aurora-subnet-group-${config.clusterIdentifier}`, {
        provider: provider,
        name: `${config.clusterIdentifier}-sng`,
        subnetIds: subnetIds,
        tags: config.tags,
      });
      dbSubnetGroupName = dbSubnetGroup.name;
    }

    const securityGroupIds = config.vpcSecurityGroupNames.map((name) => {
      const sgId = params.securityGroups[name];
      if (!sgId) {
        throw new Error(`Security Group with name ${name} not found for Aurora Cluster ${config.clusterIdentifier}`);
      }
      return sgId;
    });

    // Create monitoring role if needed
    let monitoringRoleArn = config.monitoringRoleArn;
    if (config.enableEnhancedMonitoring && config.createMonitoringRole && !monitoringRoleArn) {
      const monitoringRole = new IamRole(scope, `aurora-monitoring-role-${config.clusterIdentifier}`, {
        name: `${config.clusterIdentifier}-monitoring-role`,
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

      new IamRolePolicyAttachment(scope, `aurora-monitoring-policy-${config.clusterIdentifier}`, {
        role: monitoringRole.name,
        policyArn: "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole",
      });

      monitoringRoleArn = monitoringRole.arn;
    }

    let dbClusterParameterGroupName = config.dbClusterParameterGroupName;
    if (!dbClusterParameterGroupName && config.dbClusterParameterGroupFamily) {
        // Load cluster parameters from file if specified
        let clusterParameters = undefined;
        if (config.dbClusterParameterGroupParametersFile) {
          const absolutePath = path.resolve(process.cwd(), config.dbClusterParameterGroupParametersFile);
          const paramModule = require(absolutePath);
          // Support both default export and named export
          clusterParameters = paramModule.default || paramModule[Object.keys(paramModule)[0]];
        }
        
        const clusterPg = new RdsClusterParameterGroup(scope, `aurora-cluster-pg-${config.clusterIdentifier}`, {
            name: `${config.clusterIdentifier}-cpg`,
            family: config.dbClusterParameterGroupFamily,
            parameter: clusterParameters,
            tags: config.tags,
        });
        dbClusterParameterGroupName = clusterPg.name;
    }

    let instanceParameterGroupName = config.instanceParameterGroupName;
    if (!instanceParameterGroupName && config.instanceParameterGroupFamily) {
        // Load instance parameters from file if specified
        let instanceParameters = undefined;
        if (config.instanceParameterGroupParametersFile) {
          const absolutePath = path.resolve(process.cwd(), config.instanceParameterGroupParametersFile);
          const paramModule = require(absolutePath);
          // Support both default export and named export
          instanceParameters = paramModule.default || paramModule[Object.keys(paramModule)[0]];
        }
        
        const instancePg = new DbParameterGroup(scope, `aurora-instance-pg-${config.clusterIdentifier}`, {
            name: `${config.clusterIdentifier}-ipg`,
            family: config.instanceParameterGroupFamily,
            parameter: instanceParameters,
            tags: config.tags,
        });
        instanceParameterGroupName = instancePg.name;
    }

    let rdsClusterProps: any = {
        provider: provider,
        clusterIdentifier: config.clusterIdentifier,
        engine: config.engine,
        engineVersion: config.engineVersion,
        masterUsername: config.masterUsername,
        dbSubnetGroupName: dbSubnetGroupName,
        vpcSecurityGroupIds: securityGroupIds,
        dbClusterParameterGroupName: dbClusterParameterGroupName,
        skipFinalSnapshot: config.skipFinalSnapshot,
        tags: config.tags,
        // Backup
        backupRetentionPeriod: config.backupRetentionPeriod !== undefined ? config.backupRetentionPeriod : 7,
        preferredBackupWindow: config.preferredBackupWindow,
        // Logs (cluster level)
        enabledCloudwatchLogsExports: config.enabledCloudwatchLogsExports,
        // Auto upgrade (cluster level)
        allowMajorVersionUpgrade: false, // Usually false for production
        // Maintenance (cluster level)
        preferredMaintenanceWindow: config.preferredMaintenanceWindow,
        storageEncrypted: config.storageEncrypted,
    };

    if (config.manageMasterUserPassword) {
      rdsClusterProps.manageMasterUserPassword = true;
    } else if (config.masterPasswordSecretKey) {
      const dbPasswordSecret = new DataAwsSecretsmanagerSecretVersion(scope, `aurora-password-secret-${config.clusterIdentifier}`, {
        secretId: config.masterPasswordSecretKey,
      });
      rdsClusterProps.masterPassword = dbPasswordSecret.secretString;
    } else {
      rdsClusterProps.masterPassword = config.masterPassword;
    }

    const cluster = new RdsCluster(scope, `auroraCluster-${config.clusterIdentifier}`, rdsClusterProps);

    // Create instances starting from 1
    for (let i = 1; i <= config.instanceCount; i++) {
      const instanceProps: any = {
        provider: provider,
        identifier: `${config.clusterIdentifier}-instance-${i}`,
        clusterIdentifier: cluster.clusterIdentifier,
        instanceClass: config.instanceClass,
        engine: config.engine,
        engineVersion: config.engineVersion,
        dbParameterGroupName: instanceParameterGroupName,
        tags: config.tags,
        // Performance Insights (instance level)
        performanceInsightsEnabled: config.enablePerformanceInsights,
        performanceInsightsRetentionPeriod: config.performanceInsightsRetentionPeriod,
        // Enhanced Monitoring (instance level)
        monitoringInterval: config.enableEnhancedMonitoring ? (config.monitoringInterval || 60) : 0,
        monitoringRoleArn: config.enableEnhancedMonitoring ? monitoringRoleArn : undefined,
        // Auto upgrade (instance level)
        autoMinorVersionUpgrade: config.autoMinorVersionUpgrade !== undefined ? config.autoMinorVersionUpgrade : true,
        // Maintenance (instance level)
        preferredMaintenanceWindow: config.instancePreferredMaintenanceWindow,
      };
      
      new RdsClusterInstance(scope, `auroraInstance-${config.clusterIdentifier}-${i}`, instanceProps);
    }

    let masterUserSecretArn: string | undefined = undefined;
    if (config.manageMasterUserPassword && cluster.masterUserSecret) {
      masterUserSecretArn = cluster.masterUserSecret.get(0).secretArn;
    }

    return {
      rdsCluster: cluster,
      masterUserSecretArn: masterUserSecretArn,
    };
  });

  return clusters;
}
