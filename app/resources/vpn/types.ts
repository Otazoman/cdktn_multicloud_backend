import { VpnGateway } from "@cdktn/provider-aws/lib/vpn-gateway";
import { createAwsCustomerGateway } from "../../constructs/vpnnetwork/awscgw";
import { createAzureLocalGateways } from "../../constructs/vpnnetwork/azurelocalgwcon";
import { createAzureVpnGateway } from "../../constructs/vpnnetwork/azurevpngw";
import { createGooglePeerTunnel } from "../../constructs/vpnnetwork/googletunnels";
import { createGoogleVpnGateway } from "../../constructs/vpnnetwork/googlevpngw";

// Types of the cross-cloud VPN module (resources/vpnResources.ts, resources/vpn/).

/** Resources of one VPN pair (only the kinds that pair uses are set). */
export interface VpnConnectionResources {
  /** AWS customer gateways and VPN connections */
  customerGateways?: ReturnType<typeof createAwsCustomerGateway>;
  /** Google VPN tunnels, router interfaces and peers */
  googleTunnels?: ReturnType<typeof createGooglePeerTunnel>;
  /** Azure local network gateways and connections */
  localGateways?: ReturnType<typeof createAzureLocalGateways>;
}

// VPN resources interface
export interface VpnResources {
  /** VPN gateway per cloud (created when the cloud takes part in a pair) */
  gateways: {
    aws?: VpnGateway;
    /** Single tunnel (Classic VPN) or HA VPN gateway, depending on env */
    google?: ReturnType<typeof createGoogleVpnGateway>;
    azure?: ReturnType<typeof createAzureVpnGateway>;
  };
  /** Resources of each enabled pair, keyed by pair id ("aws-google", ...) */
  connections: Record<string, VpnConnectionResources>;
}

export interface TunnelConfig {
  address: string;
  preshared_key?: string;
  shared_key?: string;
  apipaCidr?: string;
  peerAddress?: string;
  cidrhost?: string;
  ipAddress?: string;
}
