import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Token } from "cdktf";
import { Construct } from "constructs";
import { ec2Configs } from "../config/aws/awssettings";
import { azureVmsConfigparams } from "../config/azure/azuresettings";
import {
  awsToAzure,
  awsToGoogle,
  googleToAzure,
} from "../config/commonsettings";
import { gceInstancesParams } from "../config/google/googlesettings";
import { createAwsEc2Instances } from "../constructs/vmresources/awsec2";
import { createAzureVms } from "../constructs/vmresources/azurevm";
import { createGoogleGceInstances } from "../constructs/vmresources/googlegce";
import {
  AwsVpcResources,
  AzureVnetResources,
  GoogleVpcResources,
} from "./interfaces";

export const createVmResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider,
  azureProvider: AzurermProvider,
  awsVpcResources?: AwsVpcResources,
  googleVpcResources?: GoogleVpcResources,
  azureVnetResources?: AzureVnetResources
) => {
  if ((awsToAzure || awsToGoogle) && awsVpcResources) {
    //AWS EC2 Instances
    const getSecurityGroupId = (name: string): string => {
      const mapping = awsVpcResources.securityGroupMapping;
      if (mapping && typeof mapping === "object" && name in mapping) {
        return Token.asString(mapping[name as keyof typeof mapping]);
      }
      console.log(`No security group found for name: ${name}`);
      return "default-security-group-id";
    };

    const awsEc2Instances = createAwsEc2Instances(scope, awsProvider, {
      instanceConfigs: ec2Configs.map((config) => {
        const { securityGroupIds, ...restConfig } = config;

        return {
          ...restConfig,
          securityGroupIds: securityGroupIds
            .map((name) => getSecurityGroupId(name))
            .filter((id): id is string => id !== undefined),
          subnetKey: (config as any).subnetKey,
        };
      }),

      subnets: awsVpcResources.subnetsByName,
    });

    awsEc2Instances.forEach((instance) =>
      instance.node.addDependency(awsVpcResources)
    );
  }

  if ((awsToGoogle || googleToAzure) && googleVpcResources) {
    // Google GCE Instances
    const googleGceInstances = createGoogleGceInstances(
      scope,
      googleProvider,
      gceInstancesParams,
      googleVpcResources.vpc,
      googleVpcResources.subnets
    );
    googleGceInstances.forEach((instance) =>
      instance.node.addDependency(googleVpcResources)
    );
  }

  if ((awsToAzure || googleToAzure) && azureVnetResources) {
    // Azure VMs
    const azureVmParams = {
      vnetName: azureVnetResources.vnet.name,
      subnets: azureVnetResources.subnets,
      vmConfigs: azureVmsConfigparams,
    };
    const azureVms = createAzureVms(scope, azureProvider, azureVmParams);
    azureVms.forEach((vm) => vm.node.addDependency(azureVnetResources.subnets));
  }
};
