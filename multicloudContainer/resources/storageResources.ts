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
import { filestoreConfigs } from "../config/google/googlesettings";
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

      // Set dependency for all Access Points (Added in this fix)
      res.accessPoints.forEach((ap) => ap.node.addDependency(awsVpcResources));
    });
  }

  // 2. Google Cloud Filestore
  if ((awsToGoogle || googleToAzure) && googleVpcResources) {
    const filestoreRes = createGoogleFilestoreInstances(
      scope,
      googleProvider,
      {
        project: filestoreConfigs[0].project,
        filestoreConfigs: filestoreConfigs,
      },
      googleVpcResources.vpc,
      googleVpcResources.subnets,
    );

    outputs.googleFilestore.push(...filestoreRes);

    filestoreRes.forEach((res) => {
      res.instance.node.addDependency(googleVpcResources);
    });
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
