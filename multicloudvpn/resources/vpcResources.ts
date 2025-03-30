import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
import { Construct } from "constructs";
import { awsVpcResourcesparams } from "../config/awssettings";
import { azureVnetResourcesparams } from "../config/azuresettings";
import {
  awsToAzure,
  awsToGoogle,
  googleToAzure,
} from "../config/commonsettings";
import { googleVpcResourcesparams } from "../config/googlesettings";
import { createAwsVpcResources } from "../constructs/vpcnetwork/awsvpc";
import { createAzureVnetResources } from "../constructs/vpcnetwork/azurevnet";
import { createGoogleVpcResources } from "../constructs/vpcnetwork/googlevpc";

interface VpcResources {
  awsVpcResources?: any;
  googleVpcResources?: any;
  azureVnetResources?: any;
}

export const createVpcResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider,
  azureProvider: AzurermProvider
): VpcResources => {
  const resources: VpcResources = {};

  if (awsToAzure || awsToGoogle) {
    resources.awsVpcResources = createAwsVpcResources(
      scope,
      awsProvider,
      awsVpcResourcesparams
    );
  }

  if (awsToGoogle || googleToAzure) {
    resources.googleVpcResources = createGoogleVpcResources(
      scope,
      googleProvider,
      googleVpcResourcesparams
    );
  }

  if (awsToAzure || googleToAzure) {
    resources.azureVnetResources = createAzureVnetResources(
      scope,
      azureProvider,
      azureVnetResourcesparams
    );
  }

  return resources;
};
