import { ComputeSubnetwork } from "@cdktn/provider-google/lib/compute-subnetwork";
import { ITerraformDependable } from "cdktn";
import { DnsManagedZone } from "@cdktn/provider-google/lib/dns-managed-zone";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import { Providers } from "../../providers/providers";
import { GoogleResourcesOutput, GoogleVpcResources } from "./types";

/** Values shared between the Google Cloud feature modules. */
export interface GoogleBuildContext {
  scope: Construct;
  providers: Providers;
  googleProvider: GoogleProvider;
  output: GoogleResourcesOutput;
  subnetsByName: Record<string, ComputeSubnetwork>;
  googleVpcResources: GoogleVpcResources;
  publicZones: Record<string, DnsManagedZone>;
  psaDependencies: ITerraformDependable[] | undefined;
}
