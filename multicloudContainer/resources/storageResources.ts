import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Token } from "cdktn";
import { Construct } from "constructs";

import { PrivateDnsZone } from "@cdktn/provider-azurerm/lib/private-dns-zone";
import { createAwsEfs } from "../constructs/storage/awsefs";
import {
  AzureFilesOutput,
  createAzureFilesResources,
} from "../constructs/storage/azurefiles";
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
  AzureVnetResources,
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
    azureVnetResources?: AzureVnetResources;
  },
): StorageResourcesOutput => {
  const { awsVpcResources, googleVpcResources, azureVnetResources } = networks;
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

    const buildableEfsConfigs = efsConfigs.filter((c) => c.build);

    const efsRes = createAwsEfs(scope, awsProvider, {
      efsConfigs: buildableEfsConfigs.map((config) => ({
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

    // Collect EFS metadata for DNS CNAME record registration in aws.inner.
    // fileSystem.dnsName resolves to "fs-xxxx.efs.<region>.amazonaws.com" at apply time.
    outputs.awsEfsInstances = efsRes
      .map((res, idx) => {
        const cfg = buildableEfsConfigs[idx];
        if (!cfg.cnameRecordName) return null;
        return {
          cnameRecordName: cfg.cnameRecordName,
          dnsFqdn: res.fileSystem.dnsName,
        };
      })
      .filter(
        (item): item is { cnameRecordName: string; dnsFqdn: string } =>
          item !== null,
      );
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
    const buildableAzureFilesConfigs = azureFilesConfigs.filter((c) => c.build);

    // Shared privatelink.file.core.windows.net DNS Zone across all storage accounts.
    // Created by the first account; reused by subsequent accounts to avoid duplicate zone error.
    let sharedFilesPrivateDnsZone: PrivateDnsZone | undefined = undefined;

    buildableAzureFilesConfigs.forEach((config) => {
      // Resolve Private Endpoint options from VNet resources when privateEndpointEnabled
      let azureRes: AzureFilesOutput;

      if (
        config.privateEndpointEnabled &&
        azureVnetResources &&
        config.subnetKey
      ) {
        const subnetResource = (
          azureVnetResources.subnets as Record<string, any>
        )[config.subnetKey];
        const subnetId: string = subnetResource?.id ?? subnetResource ?? "";
        const virtualNetworkId: string =
          (azureVnetResources.vnet as any).id ?? "";

        azureRes = createAzureFilesResources(scope, azureProvider, config, {
          subnetId,
          virtualNetworkId,
          sharedPrivateDnsZone: sharedFilesPrivateDnsZone,
        });

        // Capture the shared DNS zone from the first storage account
        if (!sharedFilesPrivateDnsZone && azureRes.privateDnsZone) {
          sharedFilesPrivateDnsZone = azureRes.privateDnsZone;
        }
      } else {
        azureRes = createAzureFilesResources(scope, azureProvider, config);
      }

      outputs.azureFiles.push(azureRes);
    });

    // Collect Azure Files metadata for DNS CNAME record registration in azure.inner.
    // When Private Endpoint is enabled, CNAME points to the privatelink FQDN so that
    // DNS resolution stays within the VNet via the Private DNS Zone.
    // When Private Endpoint is disabled, CNAME points to the public file endpoint.
    outputs.azureFilesInstances = buildableAzureFilesConfigs
      .map((cfg, idx) => {
        if (!cfg.cnameRecordName) return null;
        const storageAccount = outputs.azureFiles[idx]?.storageAccount;
        if (!storageAccount) return null;

        // Use privatelink FQDN when Private Endpoint is enabled (stays within VNet)
        // Use public FQDN when Private Endpoint is disabled
        const fqdn = cfg.privateEndpointEnabled
          ? `${cfg.accountName}.privatelink.file.core.windows.net`
          : `${cfg.accountName}.file.core.windows.net`;

        return {
          cnameRecordName: cfg.cnameRecordName,
          fqdn,
        };
      })
      .filter(
        (item): item is { cnameRecordName: string; fqdn: string } =>
          item !== null,
      );
  }

  return outputs;
};
