import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Token } from "cdktn";
import { Construct } from "constructs";

import { createAwsEfs } from "../constructs/storage/awsefs";
import { createAzureFilesResources } from "../constructs/storage/azurefiles";
import { createGoogleFilestoreInstances } from "../constructs/storage/googlefilestore";

import { efsConfigs } from "../config/aws/awssettings";
import { azureFilesConfigs } from "../config/azure/azuresettings";
import {
  awsToAzure,
  awsToGoogle,
  googleToAzure,
} from "../config/commonsettings";
import {
  filestoreConfigs,
  googlePsaConfig,
} from "../config/google/googlesettings";
import { GooglePrivateServiceAccess } from "../constructs/vpcnetwork/googlepsa";
import {
  AwsVpcResources,
  GoogleVpcResources,
  StorageResourcesOutput,
} from "./interfaces";

/**
 * Orchestrator to create storage resources across different cloud providers.
 * Handles ID resolution for AWS Security Groups and project configuration for GCP.
 */
export const createStorageResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider,
  azureProvider: AzurermProvider,
  networks: {
    awsVpcResources?: AwsVpcResources;
    googleVpcResources?: GoogleVpcResources;
    googleSubnets: any[];
  },
): StorageResourcesOutput => {
  const { awsVpcResources, googleVpcResources } = networks;
  const outputs: StorageResourcesOutput = {
    awsEfs: [],
    googleFilestore: [],
    azureFiles: [],
  };

  // 1. AWS EFS (Elastic File System)
  if ((awsToAzure || awsToGoogle) && awsVpcResources) {
    /**
     * Map Security Group names to synthesized IDs using the mapping from VPC resources.
     * This ensures EFS receives the required "sg-xxxx" format.
     */
    const getSecurityGroupId = (name: string): string => {
      const mapping = awsVpcResources.securityGroupMapping;
      if (mapping && typeof mapping === "object" && name in mapping) {
        return Token.asString(mapping[name as keyof typeof mapping]);
      }
      console.warn(`No security group found for name: ${name}`);
      return "default-security-group-id";
    };

    const efsRes = createAwsEfs(scope, awsProvider, {
      efsConfigs: efsConfigs.map((config) => ({
        ...config,
        // Convert SG names to IDs
        securityGroupIds:
          config.securityGroupIds?.map((name) => getSecurityGroupId(name)) ||
          [],
      })),
      subnets: awsVpcResources.subnetsByName,
    });

    outputs.awsEfs.push(...efsRes);

    /**
     * Set explicit dependencies.
     * Ensure FileSystem, MountTargets, and AccessPoints depend on the VPC infrastructure.
     */
    efsRes.forEach((res) => {
      // Set dependency for the File System itself
      res.fileSystem.node.addDependency(awsVpcResources);

      // Set dependency for all Mount Targets
      res.mountTargets.forEach((target) =>
        target.node.addDependency(awsVpcResources),
      );

      // Set dependency for all Access Points
      res.accessPoints.forEach((ap) => ap.node.addDependency(awsVpcResources));
    });
  }

  // 2. Google Cloud Filestore
  if ((awsToGoogle || googleToAzure) && googleVpcResources) {
    // Create or reuse the shared PSA construct.
    // PSA settings are read from googlePsaConfig (config/google/psa.ts).
    // getOrCreate ensures only one PSA construct exists per CDK scope even when
    // both Filestore and CloudSQL are deployed simultaneously.
    const psa = GooglePrivateServiceAccess.getOrCreate(
      scope,
      googlePsaConfig.psaConstructId,
      googleProvider,
      {
        project: filestoreConfigs.project,
        vpcId: googleVpcResources.vpc.id,
        vpcName: googleVpcResources.vpc.name,
        isExisting: googlePsaConfig.isExisting,
        serviceRanges: googlePsaConfig.serviceRanges,
      },
    );

    // Build only the instances that have build: true, keeping index alignment
    const buildableInstances = filestoreConfigs.instances.filter(
      (c) => c.build,
    );

    const filestoreRes = createGoogleFilestoreInstances(
      scope,
      googleProvider,
      {
        project: filestoreConfigs.project,
        filestoreConfigs: buildableInstances,
        // Pass PSA resources as explicit TerraformResource references so they
        // appear in the generated cdk.tf.json depends_on array.
        // node.addDependency() on a Construct is not serialised into depends_on
        // by CDKTF, so we must use ITerraformDependable references directly.
        psaDependencies: [psa.connection, psa.peeringRoutesConfig],
      },
      googleVpcResources.vpc,
      googleVpcResources.subnets,
    );

    outputs.googleFilestore.push(...filestoreRes);

    // Collect Filestore instance metadata for DNS A record registration.
    // ipAddresses is a list attribute on the network block; index 0 is the primary IP.
    outputs.googleFilestoreInstances = filestoreRes
      .map((res, idx) => {
        const cfg = buildableInstances[idx];
        if (!cfg.aRecordName) return null;
        return {
          aRecordName: cfg.aRecordName,
          // networks[0].ipAddresses[0] is the primary private IP assigned by GCP
          // ipAddresses is string[] so use array index, not .get()
          privateIpAddress: res.instance.networks.get(0).ipAddresses[0],
        };
      })
      .filter(
        (item): item is { aRecordName: string; privateIpAddress: string } =>
          item !== null,
      );

    filestoreRes.forEach((res) => {
      // Keep the VPC-level construct dependency for ordering within the CDK graph.
      // The explicit depends_on on psa.connection and psa.peeringRoutesConfig is
      // now handled via psaDependencies above, which guarantees the resources appear
      // in the generated cdk.tf.json depends_on block.
      res.instance.node.addDependency(googleVpcResources);
    });

    // Expose PSA TerraformResource references so that GCE instances created in
    // vmResources can declare explicit depends_on entries and wait for the peering
    // routes to be fully configured before attempting VM placement.
    outputs.googlePsaDependencies = [psa.connection, psa.peeringRoutesConfig];
  }

  // 3. Azure Storage & File Shares
  if (awsToAzure || googleToAzure) {
    azureFilesConfigs
      .filter((c) => c.build)
      .forEach((config) => {
        const azureRes = createAzureFilesResources(
          scope,
          azureProvider,
          config,
        );
        outputs.azureFiles.push(azureRes);
      });
  }

  return outputs;
};
