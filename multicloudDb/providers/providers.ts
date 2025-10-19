import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
import { TlsProvider } from "@cdktf/provider-tls/lib/provider";
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

  const tlsProvider = new TlsProvider(scope, "tls", {});

  return { awsProvider, googleProvider, azureProvider, tlsProvider };
};
