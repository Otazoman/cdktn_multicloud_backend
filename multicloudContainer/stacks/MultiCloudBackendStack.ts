import { TerraformStack } from "cdktn";
import { Construct } from "constructs";
import { hostZones, useVpn } from "../config/commonsettings";
import { createProviders } from "../providers/providers";
import { createAwsResources } from "../resources/awsResources";
import { createAzureResources } from "../resources/azureResources";
import { createGoogleResources } from "../resources/googleResources";
import { createPrivateZoneResources } from "../resources/privateZoneResources";
import { createVpnResources } from "../resources/vpnResources";

/**
 * MultiCloudBackendStack
 *
 * Orchestrates resource creation across AWS, Azure, and Google Cloud.
 *
 * Each cloud's resources (VPC → PublicDNS → Storage → DB → VM → Containers → DNS A-records)
 * are fully self-contained within their own orchestrator (awsResources / azureResources /
 * googleResources).  This ensures that Construct references are available for CDKTF to
 * generate proper depends_on entries in cdk.tf.json, which is the key fix for the Google
 * VPC subnet zombie-deletion issue.
 *
 * Cross-cloud resources (VPN, Private DNS Zones) receive VPC outputs from each orchestrator.
 */
export class MultiCloudBackendStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // ── Providers ──────────────────────────────────────────────────────────
    const { awsProvider, googleProvider, azureProvider } =
      createProviders(this);

    // ── Per-cloud orchestrators ─────────────────────────────────────────────
    // Each orchestrator creates resources in the following order internally:
    //   VPC → Public DNS Zone → Storage → DB → VM → Containers → DNS A-records
    //
    // Flags (useStorage, useDbs, useVms, useContainers, useDns) and cross-cloud
    // conditions (awsToGoogle, awsToAzure, googleToAzure) are evaluated inside
    // each orchestrator – the commonsettings config is never changed.

    const aws = createAwsResources(this, awsProvider);
    const google = createGoogleResources(this, googleProvider);
    const azure = createAzureResources(this, azureProvider);

    // ── Cross-cloud: VPN ────────────────────────────────────────────────────
    // VPN resources span all three clouds and require VPC references.
    // vpnResources.ts is kept as a cross-cloud orchestrator; it receives the
    // VPC outputs from each per-cloud orchestrator.
    if (useVpn) {
      createVpnResources(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
        aws.vpc,
        google.vpc,
        azure.vpc,
      );
    }

    // ── Cross-cloud: Private DNS Zones ──────────────────────────────────────
    // Private Zone resources (inbound resolvers, forwarding rules, inner zones)
    // also span all three clouds and require VPC + DB/Storage output references.
    if (hostZones) {
      createPrivateZoneResources(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
        // VPC resources
        aws.vpc,
        google.vpc,
        azure.vpc,
        // DB / Storage metadata for CNAME / A-record registration
        aws.dbResources,
        google.cloudSqlInstances,
        google.filestoreInstances,
        azure.dbResources,
        aws.efsInstances,
        azure.filesInstances,
        azure.acaInstances,
      );
    }
  }
}
