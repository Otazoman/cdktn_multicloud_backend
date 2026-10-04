import { Construct } from "constructs";
import { CloudId } from "../config/commonsettings";
import { Providers } from "../providers/providers";
import { AwsResourcesOutput } from "./aws/types";
import { AzureResourcesOutput } from "./azure/types";
import { GoogleResourcesOutput } from "./google/types";

/** Output of each cloud's orchestrator, keyed by cloud. */
export interface CloudOutputs {
  aws: AwsResourcesOutput;
  google: GoogleResourcesOutput;
  azure: AzureResourcesOutput;
}

/** Creates all per-cloud resources of one cloud. */
export type CloudModule<K extends CloudId> = (
  scope: Construct,
  providers: Providers,
) => CloudOutputs[K];

/**
 * Everything cross-cloud modules (VPN, private DNS) need, passed as a single
 * argument so that adding a cloud does not change their signatures.
 */
export interface CloudContext {
  scope: Construct;
  providers: Providers;
  outputs: CloudOutputs;
}
