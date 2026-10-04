import { TerraformStack } from "cdktn";
import { Construct } from "constructs";
import { createCloudResources } from "../clouds/registry";
import { CloudContext } from "../clouds/types";
import { hostZones, useVpn } from "../config/commonsettings";
import { createProviders } from "../providers/providers";
import { createPrivateZoneResources } from "../resources/privateZoneResources";
import { createVpnResources } from "../resources/vpnResources";

/**
 * MultiCloudBackendStack
 *
 * Orchestrates resource creation across all registered clouds
 * (clouds/registry.ts).
 *
 * Each cloud's resources (VPC → PublicDNS → Storage → DB → VM → Containers → DNS A-records)
 * are fully self-contained within their own orchestrator. This ensures that Construct
 * references are available for CDKTN to generate proper references in cdk.tf.json,
 * which is the key fix for the Google VPC subnet zombie-deletion issue.
 *
 * Cross-cloud resources (VPN, Private DNS Zones) receive every cloud's output through
 * a single CloudContext.
 */
export class MultiCloudBackendStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // ── Providers (declared only in providers/providers.ts) ────────────────
    const providers = createProviders(this);

    // ── Per-cloud orchestrators ─────────────────────────────────────────────
    // Each orchestrator creates resources in the following order internally:
    //   VPC → Public DNS Zone → Storage → DB → VM → Containers → DNS A-records
    //
    // Per-cloud switches (`clouds` in commonsettings.ts) are evaluated inside
    // each orchestrator via config/features.ts. They do not depend on VPN
    // connections.
    const outputs = createCloudResources(this, providers);

    const ctx: CloudContext = { scope: this, providers, outputs };

    // ── Cross-cloud: VPN ────────────────────────────────────────────────────
    const vpn = useVpn ? createVpnResources(ctx) : undefined;

    // ── Cross-cloud: Private DNS Zones ──────────────────────────────────────
    // Needs VPC + DB/Storage outputs (from ctx) and the VPN resources for the
    // Azure Private DNS Resolver dependency on the GatewaySubnet.
    if (hostZones) {
      createPrivateZoneResources(ctx, vpn);
    }
  }
}
