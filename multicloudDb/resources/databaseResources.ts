import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { ComputeGlobalAddress } from "@cdktn/provider-google/lib/compute-global-address";
import { ComputeNetworkPeeringRoutesConfig } from "@cdktn/provider-google/lib/compute-network-peering-routes-config";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { ServiceNetworkingConnection } from "@cdktn/provider-google/lib/service-networking-connection";
import { TerraformOutput } from "cdktf";
import { Construct } from "constructs";
import { auroraConfigs, rdsConfigs } from "../config/aws/aurorards/aurorards";
import { azureDatabaseConfig } from "../config/azure/azuredatabase/databases";
import {
  awsToAzure,
  awsToGoogle,
  googleToAzure,
} from "../config/commonsettings";
import { cloudSqlConfig } from "../config/google/cloudsql/cloudsql";
import { createSharedPrivateDnsZones } from "../constructs/privatezone/azureprivatezone";
import {
  AwsRelationalDatabaseConfig,
  createAwsRelationalDatabases,
} from "../constructs/relationaldatabase/awsrelationaldatabase";
import { createAzureDatabases } from "../constructs/relationaldatabase/azuredatabase";
import {
  CloudSqlConfig,
  createGoogleCloudSqlInstance,
} from "../constructs/relationaldatabase/googlecloudsql";
import {
  AwsDbResources,
  AwsVpcResources,
  AzureVnetResources,
  DatabaseResourcesOutput,
  GoogleVpcResources,
} from "./interfaces";

/**
 * Helper function to create database secret ARN outputs with safe conditional access
 * This function only creates outputs when AWS-managed passwords are actually enabled
 * and the secret exists to prevent access to non-existent resources during transitions
 */
const createSecretArnOutput = (
  scope: Construct,
  config: AwsRelationalDatabaseConfig,
  dbOutput: any,
  index: number
): void => {
  // Skip output creation if suppressSecretOutput flag is set (for migration scenarios)
  if (config.suppressSecretOutput) {
    console.log(
      `Skipping secret ARN output for ${config.identifier}: suppressSecretOutput enabled for migration`
    );
    return;
  }

  // Only create outputs if manageMasterUserPassword is true
  if (!config.manageMasterUserPassword) {
    console.log(
      `Skipping secret ARN output for ${config.identifier}: manageMasterUserPassword is false`
    );
    return;
  }

  const sanitizedId = config.identifier.replace(/[^a-zA-Z0-9]/g, "-");

  try {
    if (dbOutput.rdsCluster) {
      // For Aurora clusters - only create output if the secret property exists
      const secretProperty = dbOutput.rdsCluster.masterUserSecret;
      if (secretProperty) {
        new TerraformOutput(
          scope,
          `aurora-secret-arn-${sanitizedId}-${index}`,
          {
            value: secretProperty,
            description: `Master user secret for Aurora cluster: ${config.identifier}`,
          }
        );
      } else {
        console.log(
          `Aurora cluster ${config.identifier}: masterUserSecret not available yet (transition in progress)`
        );
      }
    } else if (dbOutput.dbInstance) {
      // For RDS instances - only create output if the secret property exists
      const secretProperty = dbOutput.dbInstance.masterUserSecret;
      if (secretProperty) {
        new TerraformOutput(scope, `rds-secret-arn-${sanitizedId}-${index}`, {
          value: secretProperty,
          description: `Master user secret for RDS instance: ${config.identifier}`,
        });
      } else {
        console.log(
          `RDS instance ${config.identifier}: masterUserSecret not available yet (transition in progress)`
        );
      }
    }
  } catch (error) {
    console.warn(
      `Warning: Could not create secret ARN output for ${config.identifier}:`,
      error
    );
  }
};

/**
 * Helper function to map RDS configs to AWS relational database configs
 */
const mapRdsConfigs = (): AwsRelationalDatabaseConfig[] => {
  return rdsConfigs.map((config) => ({
    ...config,
    type: "rds" as const,
    masterUsername:
      typeof config.username === "string" ? config.username : undefined,
    password:
      !config.manageMasterUserPassword &&
      typeof (config as any).password === "string"
        ? (config as any).password
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
};

/**
 * Helper function to map Aurora configs to AWS relational database configs
 */
const mapAuroraConfigs = (): AwsRelationalDatabaseConfig[] => {
  return auroraConfigs.map((config) => ({
    ...config,
    type: "aurora" as const,
    identifier: config.clusterIdentifier,
  }));
};

export const createDatabaseResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider?: GoogleProvider,
  azurermProvider?: AzurermProvider,
  awsVpcResources?: AwsVpcResources,
  googleVpcResources?: GoogleVpcResources,
  azureVnetResources?: AzureVnetResources
): DatabaseResourcesOutput | undefined => {
  const googleCloudSqlConnectionNames: {
    [instanceName: string]: string;
  } = {};

  const googleCloudSqlInstancesData: Array<{
    name: string;
    privateIpAddress: string;
    connectionName: string;
    aRecordName: string;
  }> = [];

  let awsDbResources: AwsDbResources | undefined;
  let azureDatabaseResources:
    | Array<{
        server: any;
        database: any;
        privateDnsZone?: any;
        fqdn: string;
      }>
    | undefined;

  // AWS RDS and Aurora (only if AWS VPC resources exist)
  if ((awsToGoogle || awsToAzure) && awsProvider && awsVpcResources) {
    const combinedAwsDatabaseConfigs: AwsRelationalDatabaseConfig[] = [
      ...mapRdsConfigs(),
      ...mapAuroraConfigs(),
    ];

    const awsRelationalDatabases = createAwsRelationalDatabases(
      scope,
      awsProvider,
      {
        databaseConfigs: combinedAwsDatabaseConfigs.filter(
          (config) => config.build
        ),
        subnets: awsVpcResources.subnetsByName,
        securityGroups: awsVpcResources.securityGroupMapping,
      }
    );

    // Collect DB resources for CNAME records
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

    // Create outputs for managed secrets and add dependencies
    combinedAwsDatabaseConfigs
      .filter((config) => config.build)
      .forEach((config, index) => {
        const dbOutput = awsRelationalDatabases[index];

        // Add VPC dependency
        if (dbOutput.rdsCluster) {
          dbOutput.rdsCluster.node.addDependency(awsVpcResources);
          // Collect Aurora cluster info
          auroraClusters.push({
            clusterIdentifier: config.identifier,
            endpoint: dbOutput.rdsCluster.endpoint,
            readerEndpoint: dbOutput.rdsCluster.readerEndpoint,
            port: dbOutput.rdsCluster.port,
          });
        } else if (dbOutput.dbInstance) {
          dbOutput.dbInstance.node.addDependency(awsVpcResources);
          // Collect RDS instance info
          rdsInstances.push({
            identifier: config.identifier,
            endpoint: dbOutput.dbInstance.address,
            address: dbOutput.dbInstance.address,
            port: dbOutput.dbInstance.port,
          });
        }

        // Create secret ARN output if managed password is enabled
        createSecretArnOutput(scope, config, dbOutput, index);
      });

    awsDbResources = {
      rdsInstances: rdsInstances.length > 0 ? rdsInstances : undefined,
      auroraClusters: auroraClusters.length > 0 ? auroraClusters : undefined,
    };
  }

  // Google CloudSQL (only if conditions are met and resources exist)
  if ((awsToGoogle || googleToAzure) && googleProvider && googleVpcResources) {
    // Cloud SQL Private Service Access
    const privateIpAddress = new ComputeGlobalAddress(
      scope,
      cloudSqlConfig.privateIpRangeName,
      {
        provider: googleProvider,
        project: cloudSqlConfig.project,
        name: cloudSqlConfig.privateIpRangeName,
        purpose: "VPC_PEERING",
        addressType: "INTERNAL",
        address: cloudSqlConfig.googleManagedServicesVpcAddress,
        prefixLength: cloudSqlConfig.prefixLength,
        network: googleVpcResources.vpc.id,
      }
    );

    const serviceNetworkingConnection = new ServiceNetworkingConnection(
      scope,
      `cloudsql-vpc-peering-${cloudSqlConfig.privateIpRangeName}`,
      {
        provider: googleProvider,
        network: googleVpcResources.vpc.id,
        service: "servicenetworking.googleapis.com",
        reservedPeeringRanges: [privateIpAddress.name],
        // Wait until the VPC is fully provisioned
        dependsOn: [
          privateIpAddress,
          googleVpcResources.vpc,
          ...googleVpcResources.subnets,
        ],
      }
    );

    // Enable custom route export for VPC peering
    new ComputeNetworkPeeringRoutesConfig(
      scope,
      "cloudsql-export-custom-routes",
      {
        provider: googleProvider,
        project: cloudSqlConfig.project,
        peering: "servicenetworking-googleapis-com",
        network: googleVpcResources.vpc.name,
        exportCustomRoutes: true,
        importCustomRoutes: true,
        dependsOn: [serviceNetworkingConnection],
      }
    );

    // Create CloudSQL instances in a loop and handle build flags
    const googleCloudSqlInstances = cloudSqlConfig.instances
      .filter((config) => config.build)
      .map((instanceConfig) => {
        // Removed 'index' as it's no longer used
        const config: CloudSqlConfig = {
          ...instanceConfig,
          project: cloudSqlConfig.project,
        };
        return createGoogleCloudSqlInstance(
          scope,
          googleProvider,
          config,
          googleVpcResources.vpc,
          serviceNetworkingConnection,
          instanceConfig.name // Use instance name to prevent duplicate construct IDs
        );
      });

    googleCloudSqlInstances.forEach((instance, index) => {
      instance.sqlInstance.node.addDependency(serviceNetworkingConnection);
      googleCloudSqlConnectionNames[instance.sqlInstance.name] =
        instance.connectionName;

      // Get the corresponding instance configuration to access aRecordName
      const instanceConfig = cloudSqlConfig.instances.filter(
        (config) => config.build
      )[index];

      // Collect Cloud SQL instance data with private IP and aRecordName for DNS A records
      googleCloudSqlInstancesData.push({
        name: instance.sqlInstance.name,
        privateIpAddress: instance.sqlInstance.privateIpAddress,
        connectionName: instance.connectionName,
        aRecordName: instanceConfig.aRecordName, // Include aRecordName from config
      });
    });
  }

  // Azure Database (only if conditions are met and resources exist)
  if ((awsToAzure || googleToAzure) && azurermProvider && azureVnetResources) {
    // Ensure we have a proper VirtualNetwork object
    if (
      typeof azureVnetResources.vnet === "object" &&
      "name" in azureVnetResources.vnet &&
      !("id" in azureVnetResources.vnet)
    ) {
      console.warn(
        "Azure VNet is not properly initialized for database creation"
      );
      return {
        googleCloudSqlConnectionNames: googleCloudSqlConnectionNames,
      };
    }

    // Determine which database types are being deployed
    const databaseTypes = new Set<"mysql" | "postgresql">(
      azureDatabaseConfig.databases
        .filter((config) => config.build)
        .map((config) => config.type)
    );

    // Create shared Private DNS Zones for all database types before database creation
    const sharedDnsZones = createSharedPrivateDnsZones(
      scope,
      azurermProvider,
      azureDatabaseConfig.resourceGroupName,
      azureVnetResources.vnet as any,
      databaseTypes
    );

    // Create Azure Databases using the new construct function
    // Pass all subnets so each database can select its own subnet based on subnetKey
    const azureDatabases = createAzureDatabases(scope, azurermProvider, {
      resourceGroupName: azureDatabaseConfig.resourceGroupName,
      location: azureDatabaseConfig.location,
      databaseConfigs: azureDatabaseConfig.databases.filter(
        (config) => config.build
      ),
      virtualNetwork: azureVnetResources.vnet as any, // Type assertion needed due to interface union
      subnets: azureVnetResources.subnets as any, // Pass all subnets as a map
      sharedDnsZones: sharedDnsZones, // Pass pre-created DNS zones
    });

    // Add VNet dependencies and collect database information
    azureDatabases.forEach((dbOutput: any) => {
      dbOutput.server.node.addDependency(azureVnetResources);
    });

    // Collect Azure database resources for Private DNS Zone CNAME creation
    azureDatabaseResources = azureDatabases.map((dbOutput: any) => ({
      server: dbOutput.server,
      database: dbOutput.database,
      privateDnsZone: dbOutput.privateDnsZone,
      fqdn: dbOutput.fqdn,
    }));
  }

  return {
    googleCloudSqlConnectionNames: googleCloudSqlConnectionNames,
    googleCloudSqlInstances:
      googleCloudSqlInstancesData.length > 0
        ? googleCloudSqlInstancesData
        : undefined,
    awsDbResources: awsDbResources,
    azureDatabaseResources: azureDatabaseResources,
  };
};
