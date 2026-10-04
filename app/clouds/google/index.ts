/**
 * Google Cloud module (registered in clouds/registry.ts).
 *
 * Resource creation order:
 *
 *   1. VPC / Subnets / Firewall / NAT                            index.ts
 *   2. Public DNS Zone          (features.dns)                   dns.ts
 *   3. Filestore                (features.storage)               storage.ts
 *   4. Cloud SQL                (features.dbs)                   database.ts
 *   5. GCE                      (features.vms)                   compute.ts
 *   6. Cloud Run + Load Balancer, 7. DNS A-records
 *                               (features.containers [+ dns])    container.ts
 *   8. Artifact Registry + Cloud Build (features.cicd)           cicd.ts
 *
 * Subnet Construct references are passed directly so Terraform destroys
 * dependent resources before the subnets (fix for the subnet zombie-deletion
 * issue). Values shared between the modules are passed as
 * GoogleBuildContext (context.ts).
 */

import { ComputeSubnetwork } from "@cdktn/provider-google/lib/compute-subnetwork";
import { DnsManagedZone } from "@cdktn/provider-google/lib/dns-managed-zone";
import { Providers } from "../../providers/providers";
import { resourceName } from "../../utils/naming";
import { Construct } from "constructs";

import { isCloudEnabled } from "../../config/features";
import { googleVpcResourcesparams } from "../../config/google/googlesettings";
import { createGoogleVpcResources } from "../../constructs/vpcnetwork/googlevpc";
import { GoogleResourcesOutput, GoogleVpcResources } from "./types";
import { GoogleBuildContext } from "./context";
import { createGooglePublicDns } from "./dns";
import { createGoogleStorage } from "./storage";
import { createGoogleDatabases } from "./database";
import { createGoogleVms } from "./compute";
import { createGoogleContainers } from "./container";
import { createGoogleCicd } from "./cicd";

export const createGoogleResources = (
  scope: Construct,
  providers: Providers,
): GoogleResourcesOutput => {
  const googleProvider = providers.google;
  const output: GoogleResourcesOutput = {};

  // ──────────────────────────────────────────────
  // 1. VPC
  // ──────────────────────────────────────────────
  if (!isCloudEnabled("google")) {
    return output;
  }

  const vpcRaw = createGoogleVpcResources(
    scope,
    googleProvider,
    googleVpcResourcesparams,
  );

  // Build a name-keyed map of subnets so downstream resources can look them up
  // by logical name without resorting to fragile string-token comparisons.
  const subnetsByName: Record<string, ComputeSubnetwork> = {};
  googleVpcResourcesparams.subnets.forEach((cfg, idx) => {
    // Register by the actual subnet name (resourceName in subnets.ts)
    const fullName = resourceName(
      cfg.resourceName,
      "google",
      "subnet",
      cfg.name,
    );
    subnetsByName[fullName] = vpcRaw.subnets[idx];
    // Also register by short name for convenience
    subnetsByName[cfg.name] = vpcRaw.subnets[idx];
  });

  const googleVpcResources: GoogleVpcResources = {
    vpc: vpcRaw.vpc,
    subnets: vpcRaw.subnets,
    subnetsByName,
    proxySubnets: vpcRaw.proxySubnets ?? [],
    ingressrules: vpcRaw.ingressrules,
    egressrules: vpcRaw.egressrules,
    vpcLabels: googleVpcResourcesparams.vpcLabels,
  };

  output.vpc = googleVpcResources;


  // Populated by createGooglePublicDns, used by createGoogleContainers
  const publicZones: Record<string, DnsManagedZone> = {};

  const ctx: GoogleBuildContext = {
    scope,
    providers,
    googleProvider,
    output,
    subnetsByName,
    googleVpcResources,
    publicZones,
    // Private Service Access dependencies, set by the first of
    // storage / dbs / cicd that creates the PSA connection
    psaDependencies: undefined,
  };

  createGooglePublicDns(ctx);
  createGoogleStorage(ctx);
  createGoogleDatabases(ctx);
  createGoogleVms(ctx);
  createGoogleContainers(ctx);
  createGoogleCicd(ctx);

  return output;
};
