import { Construct } from "constructs";
import { CloudId } from "../config/commonsettings";
import { Providers } from "../providers/providers";
import { createAwsResources } from "./aws";
import { createAzureResources } from "./azure";
import { createGoogleResources } from "./google";
import { CloudModule, CloudOutputs } from "./types";

/**
 * Registry of cloud modules. To add a cloud, add its id to `CloudId`, its
 * output to `CloudOutputs`, and one entry here. Entries are created in this
 * order.
 */
export const cloudModules: { [K in CloudId]: CloudModule<K> } = {
  aws: createAwsResources,
  google: createGoogleResources,
  azure: createAzureResources,
};

/** Runs every registered cloud module and collects the outputs. */
export function createCloudResources(
  scope: Construct,
  providers: Providers,
): CloudOutputs {
  const outputs: Partial<CloudOutputs> = {};
  for (const id of Object.keys(cloudModules) as CloudId[]) {
    Object.assign(outputs, { [id]: cloudModules[id](scope, providers) });
  }
  return outputs as CloudOutputs;
}
