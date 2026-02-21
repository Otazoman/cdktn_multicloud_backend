import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import { awsVpcResourcesparams } from "../config/aws/awssettings";
import { azureVnetResourcesparams } from "../config/azure/azuresettings";
import {
  awsToAzure,
  awsToGoogle,
  googleToAzure,
} from "../config/commonsettings";
import { googleVpcResourcesparams } from "../config/google/googlesettings";
import { createAwsVpcResources } from "../constructs/vpcnetwork/awsvpc";
import { createAzureVnetResources } from "../constructs/vpcnetwork/azurevnet";
import { createGoogleVpcResources } from "../constructs/vpcnetwork/googlevpc";
import { VpcResources } from "./interfaces";

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
