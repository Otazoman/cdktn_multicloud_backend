import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { ComputeGlobalAddress } from "@cdktf/provider-google/lib/compute-global-address";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
import { ServiceNetworkingConnection } from "@cdktf/provider-google/lib/service-networking-connection";
import { Construct } from "constructs";
import { auroraConfigs, rdsConfigs } from "../config/aws/aurorards/aurorards";
import {
  awsToAzure,
  awsToGoogle,
  googleToAzure,
} from "../config/commonsettings";
import { cloudSqlConfig } from "../config/google/cloudsql/cloudsql";
import { createAwsAuroraClusters } from "../constructs/relationaldatabase/awsaurora";
import { createAwsRdsInstances } from "../constructs/relationaldatabase/awsrds";
import {
  CloudSqlConfig,
  createGoogleCloudSqlInstance,
} from "../constructs/relationaldatabase/googlecloudsql";
import { AwsVpcResources, GoogleVpcResources } from "./interfaces";

export interface DatabaseResourcesOutput {
  rdsMasterUserSecretArns: {
    [identifier: string]: string;
  };
  auroraMasterUserSecretArns: {
    [identifier: string]: string;
  };
  googleCloudSqlConnectionNames: {
    [instanceName: string]: string;
  };
}

export const createDatabaseResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider?: GoogleProvider,
  awsVpcResources?: AwsVpcResources,
  googleVpcResources?: GoogleVpcResources
): DatabaseResourcesOutput | undefined => {
  const rdsMasterUserSecretArns: {
    [identifier: string]: string;
  } = {};
  const auroraMasterUserSecretArns: {
    [identifier: string]: string;
  } = {};
  const googleCloudSqlConnectionNames: {
    [instanceName: string]: string;
  } = {};

  // AWS RDS and Aurora (only if AWS VPC resources exist)
  if ((awsToGoogle || awsToAzure) && awsProvider && awsVpcResources) {
    // AWS RDS Instances
    const awsRdsInstances = createAwsRdsInstances(scope, awsProvider, {
      instanceConfigs: rdsConfigs.filter((config) => config.build),
      subnets: awsVpcResources.subnetsByName,
      securityGroups: awsVpcResources.securityGroupMapping,
    });
    awsRdsInstances.forEach((instance) => {
      instance.dbInstance.node.addDependency(awsVpcResources);
      if (instance.masterUserSecretArn) {
        rdsMasterUserSecretArns[instance.dbInstance.identifier] =
          instance.masterUserSecretArn;
      }
    });

    // AWS Aurora Clusters
    const awsAuroraClusters = createAwsAuroraClusters(scope, awsProvider, {
      clusterConfigs: auroraConfigs.filter((config) => config.build),
      subnets: awsVpcResources.subnetsByName,
      securityGroups: awsVpcResources.securityGroupMapping,
    });
    awsAuroraClusters.forEach((cluster) => {
      cluster.rdsCluster.node.addDependency(awsVpcResources);
      if (cluster.masterUserSecretArn) {
        auroraMasterUserSecretArns[cluster.rdsCluster.clusterIdentifier] =
          cluster.masterUserSecretArn;
      }
    });
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

    googleCloudSqlInstances.forEach((instance) => {
      instance.sqlInstance.node.addDependency(serviceNetworkingConnection);
      googleCloudSqlConnectionNames[instance.sqlInstance.name] =
        instance.connectionName;
    });
  }

  return {
    rdsMasterUserSecretArns: rdsMasterUserSecretArns,
    auroraMasterUserSecretArns: auroraMasterUserSecretArns,
    googleCloudSqlConnectionNames: googleCloudSqlConnectionNames,
  };
};
