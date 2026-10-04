import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { NullProvider } from "@cdktn/provider-null/lib/provider";
import { Construct } from "constructs";
import { REGION as AWS_REGION } from "../config/aws/common";
import {
  LOCATION as GOOGLE_REGION,
  PROJECT_NAME as GOOGLE_PROJECT,
} from "../config/google/common";

/**
 * The single place where Terraform providers are declared. Every module
 * receives providers from here (via `Providers` / `CloudContext`) and must not
 * instantiate providers itself.
 */
export interface Providers {
  aws: AwsProvider;
  google: GoogleProvider;
  azure: AzurermProvider;
  /**
   * Returns the (single, non-aliased) null provider, creating it on first
   * use so that only stacks with null resources declare it. Declaring it
   * also pins the provider version in `required_providers`.
   */
  null(): NullProvider;
}

export const createProviders = (scope: Construct): Providers => {
  const awsProvider = new AwsProvider(scope, "aws", {
    region: AWS_REGION,
  });

  const googleProvider = new GoogleProvider(scope, "google", {
    project: GOOGLE_PROJECT,
    region: GOOGLE_REGION,
  });

  const azureProvider = new AzurermProvider(scope, "azure", {
    features: [{}],
  });

  let nullProvider: NullProvider | undefined;

  return {
    aws: awsProvider,
    google: googleProvider,
    azure: azureProvider,
    null: () => {
      nullProvider ??= new NullProvider(scope, "null");
      return nullProvider;
    },
  };
};
