import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { Construct } from "constructs";
import { auroraConfigs, rdsConfigs } from "../config/aws/aurorards/aurorards";
import { createAwsAuroraClusters } from "../constructs/relationaldatabase/awsaurora";
import { createAwsRdsInstances } from "../constructs/relationaldatabase/awsrds";
import { AwsVpcResources } from "./interfaces";

export interface DatabaseResourcesOutput {
  rdsMasterUserSecretArns: { [identifier: string]: string };
  auroraMasterUserSecretArns: { [identifier: string]: string };
}

export const createDatabaseResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  awsVpcResources?: AwsVpcResources
): DatabaseResourcesOutput | undefined => {
  if (awsVpcResources) {
    const rdsMasterUserSecretArns: { [identifier: string]: string } = {};
    const auroraMasterUserSecretArns: { [identifier: string]: string } = {};

    // AWS RDS Instances
    const awsRdsInstances = createAwsRdsInstances(scope, awsProvider, {
      instanceConfigs: rdsConfigs.filter((config) => config.build),
      subnets: awsVpcResources.subnetsByName,
      securityGroups: awsVpcResources.securityGroupMapping,
    });
    awsRdsInstances.forEach((instance) => {
      instance.dbInstance.node.addDependency(awsVpcResources);
      if (instance.masterUserSecretArn) {
        rdsMasterUserSecretArns[instance.dbInstance.identifier] = instance.masterUserSecretArn;
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
        auroraMasterUserSecretArns[cluster.rdsCluster.clusterIdentifier] = cluster.masterUserSecretArn;
      }
    });

    return {
      rdsMasterUserSecretArns: rdsMasterUserSecretArns,
      auroraMasterUserSecretArns: auroraMasterUserSecretArns,
    };
  }
  return undefined;
};
