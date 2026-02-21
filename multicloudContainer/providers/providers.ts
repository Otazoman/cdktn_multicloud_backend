import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";

export const createProviders = (scope: Construct) => {
  const awsProvider = new AwsProvider(scope, "aws", {
    region: "ap-northeast-1",
  });

  const googleProvider = new GoogleProvider(scope, "google", {
    project: "multicloud-sitevpn-project",
    region: "asia-northeast1",
  });

  const azureProvider = new AzurermProvider(scope, "azure", {
    features: [{}],
  });

  return {
    awsProvider,
    googleProvider,
    azureProvider,
  };
};
