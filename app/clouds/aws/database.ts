import { auroraConfigs, rdsConfigs } from "../../config/aws/awssettings";
import { isFeatureEnabled } from "../../config/features";
import {
  AwsRelationalDatabaseConfig,
  createAwsRelationalDatabases,
} from "../../constructs/relationaldatabase/awsrelationaldatabase";

import { addTerraformDependency } from "../../utils/terraformDependency";
import { AwsBuildContext } from "./context";

// ──────────────────────────────────────────────
// Helpers (kept private to this module)
// ──────────────────────────────────────────────

// Database config with the IAM role *name* from aurorards.ts, which is
// resolved to monitoringRoleArn before the construct is called.
type DatabaseConfigWithRoleName = AwsRelationalDatabaseConfig & {
  monitoringRoleName?: string;
};

const mapRdsConfigs = (): DatabaseConfigWithRoleName[] =>
  rdsConfigs.map((config) => ({
    ...config,
    type: "rds" as const,
    masterUsername:
      typeof config.username === "string" ? config.username : undefined,
    password:
      !config.manageMasterUserPassword &&
      typeof config.password === "string"
        ? config.password
        : undefined,
    instanceCount: undefined,
    dbClusterParameterGroupName: undefined,
    dbClusterParameterGroupFamily: undefined,
    dbClusterParameterGroupParametersFile: undefined,
    instanceParameterGroupName: undefined,
    instanceParameterGroupFamily: undefined,
    instanceParameterGroupParametersFile: undefined,
    instancePreferredMaintenanceWindow: undefined,
  }));

const mapAuroraConfigs = (): DatabaseConfigWithRoleName[] =>
  auroraConfigs.map((config) => ({
    ...config,
    type: "aurora" as const,
    identifier: config.clusterIdentifier,
  }));


/** 4. RDS / Aurora (feature: dbs) */
export function createAwsDatabases(ctx: AwsBuildContext): void {
  const { scope, awsProvider, output, awsVpcResources, cloudwatchResources, iamResources, getIamRoleArn } = ctx;

  // ──────────────────────────────────────────────
  // 4. RDS / Aurora
  // ──────────────────────────────────────────────
  if (isFeatureEnabled("aws", "dbs")) {
    const combinedConfigs: DatabaseConfigWithRoleName[] = [
      ...mapRdsConfigs(),
      ...mapAuroraConfigs(),
    ].map((config) => {
      // Resolve the Enhanced Monitoring IAM role from the role name given
      // in aurorards.ts (config.monitoringRoleName), instead of a
      // hardcoded role name.
      const monitoringRoleName = config.monitoringRoleName;

      return {
        ...config,
        monitoringRoleArn:
          config.enableEnhancedMonitoring && monitoringRoleName
            ? getIamRoleArn(
                monitoringRoleName,
                `RDS/Aurora "${config.identifier}"`,
              )
            : undefined,
      };
    });

    const awsRelationalDatabases = createAwsRelationalDatabases(
      scope,
      awsProvider,
      {
        databaseConfigs: combinedConfigs.filter((c) => c.build),
        subnets: awsVpcResources.subnetsByName,
        securityGroups: awsVpcResources.securityGroupMapping,
      },
    );

    // Ensure each database's monitoring role (if used) is fully created
    // before the DB instance/cluster that references it.
    combinedConfigs
      .filter((c) => c.build)
      .forEach((config, index) => {
        const monitoringRoleName = config.monitoringRoleName;
        if (!config.enableEnhancedMonitoring || !monitoringRoleName) return;

        const monitoringRole = iamResources.createdRoles[monitoringRoleName];
        if (!monitoringRole) return;

        const dbOutput = awsRelationalDatabases[index];
        addTerraformDependency(dbOutput.rdsCluster, monitoringRole);
        addTerraformDependency(dbOutput.dbInstance, monitoringRole);
      });

    const rdsInstances: Array<{
      identifier: string;
      endpoint: string;
      address: string;
      port: number;
    }> = [];
    const auroraClusters: Array<{
      clusterIdentifier: string;
      endpoint: string;
      readerEndpoint?: string;
      port: number;
    }> = [];

    combinedConfigs
      .filter((c) => c.build)
      .forEach((config, index) => {
        const dbOutput = awsRelationalDatabases[index];
        const logGroupPrefix = dbOutput.rdsCluster
          ? `/aws/rds/cluster/${config.identifier}`
          : `/aws/rds/instance/${config.identifier}`;

        (config.enabledCloudwatchLogsExports || []).forEach((exportType) => {
          const logGroupName = `${logGroupPrefix}/${exportType}`;
          const logGroup = cloudwatchResources.createdLogGroups[logGroupName];
          if (logGroup) {
            addTerraformDependency(dbOutput.rdsCluster, logGroup);
            addTerraformDependency(dbOutput.dbInstance, logGroup);
          }
        });
        if (dbOutput.rdsCluster) {
          addTerraformDependency(dbOutput.rdsCluster, awsVpcResources);
          auroraClusters.push({
            clusterIdentifier: config.identifier,
            endpoint: dbOutput.rdsCluster.endpoint,
            readerEndpoint: dbOutput.rdsCluster.readerEndpoint,
            port: dbOutput.rdsCluster.port,
          });
        } else if (dbOutput.dbInstance) {
          addTerraformDependency(dbOutput.dbInstance, awsVpcResources);
          rdsInstances.push({
            identifier: config.identifier,
            endpoint: dbOutput.dbInstance.address,
            address: dbOutput.dbInstance.address,
            port: dbOutput.dbInstance.port,
          });
        }
      });

    output.dbResources = {
      rdsInstances: rdsInstances.length > 0 ? rdsInstances : undefined,
      auroraClusters: auroraClusters.length > 0 ? auroraClusters : undefined,
    };
  }

}
