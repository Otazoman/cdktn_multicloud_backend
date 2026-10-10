import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import { VpnConnection } from "@cdktn/provider-aws/lib/vpn-connection";
import { ComputeForwardingRule } from "@cdktn/provider-google/lib/compute-forwarding-rule";
import { ComputeHaVpnGateway } from "@cdktn/provider-google/lib/compute-ha-vpn-gateway";
import { ComputeRouter } from "@cdktn/provider-google/lib/compute-router";
import { googleVpnParams } from "../../config/google/googlesettings";
import { createAwsCustomerGateway } from "../../constructs/vpnnetwork/awscgw";
import { createGoogleVpnGateway } from "../../constructs/vpnnetwork/googlevpngw";
import { awsVpnparams } from "../../config/aws/awssettings";
import { CloudId } from "../../config/commonsettings";
import { isConnected } from "../../config/connections";
import { vpnAddressPlan } from "../../config/vpn/addressPlan";
import { resourceName } from "../../utils/naming";
import { createGoogleVpnPeerParams } from "../../config/google/googlesettings";
import { createVpnConnectionRoutes } from "../../constructs/vpnnetwork/awsvpnroute";
import { createGooglePeerTunnel } from "../../constructs/vpnnetwork/googletunnels";
import { AwsResourcesOutput } from "../../clouds/aws/types";
import { TunnelConfig } from "./types";

// ---------------------------------------------------------------------------
// Shared constants and helpers used by the pairwise VPN setup modules in
// this directory. Add new cloud-agnostic helpers here so that every
// `setup<Cloud>To<Cloud>Vpn` module can reuse them.
// ---------------------------------------------------------------------------

export const DESTINATION = {
  AWS: "aws",
  AZURE: "azure",
  GOOGLE: "google",
} as const;

// Google Cloud's public DNS address range. Only used to decide the route
// target label for entries in customIpRanges.
export const GOOGLE_DNS_RANGE = "35.199.192.0/19";

// AWS VPN connections always have exactly 2 tunnels (tunnel1 / tunnel2), so
// this fixed pair of indexes is used to iterate over them instead of
// duplicating the same block twice.
export const AWS_TUNNEL_INDEXES = [1, 2] as const;

// ---------------------------------------------------------------------------
// Gateway-shape helpers
//
// A cloud's VPN gateway resource can look different depending on whether
// it's a single-tunnel (dev) or HA (prod) setup. These helpers normalize
// that difference so the rest of the file doesn't need to branch on it.
// ---------------------------------------------------------------------------

export function isComputeHaVpnGateway(
  gateway: unknown,
): gateway is ComputeHaVpnGateway {
  return (
    typeof gateway === "object" && gateway !== null && "vpnInterfaces" in gateway
  );
}

/**
 * Returns a cloud's VPN gateway, which pair setup functions require. Hub
 * gateways are created in createVpnResources() before any pair runs, so a
 * missing gateway means a wiring error.
 */
export function requireGateway<T>(gateway: T | undefined, name: string): T {
  if (!gateway) {
    throw new Error(`${name} VPN gateway has not been created.`);
  }
  return gateway;
}

/** Google VPN gateway (single tunnel or HA, depending on env) */
export type GoogleVpnGateway = ReturnType<typeof createGoogleVpnGateway>;

export function getVpnGatewayIpAddresses(
  gateway: GoogleVpnGateway,
  isSingleTunnel: boolean,
): string[] {
  if (isSingleTunnel) {
    return [gateway.externalIp[0].address];
  }

  const vpnGateway = gateway.vpnGateway;
  if (isComputeHaVpnGateway(vpnGateway)) {
    return AWS_TUNNEL_INDEXES.map(
      (_, i) => vpnGateway.vpnInterfaces.get(i)?.ipAddress,
    ).filter((ipAddress): ipAddress is string => Boolean(ipAddress));
  }

  if (gateway.externalIp) {
    return [gateway.externalIp[0]?.address, gateway.externalIp[1]?.address];
  }

  return [];
}

export function getCloudRouter(
  gateway: GoogleVpnGateway,
  isSingleTunnel: boolean,
): ComputeRouter | null {
  if (isSingleTunnel || !("cloudRouter" in gateway)) return null;
  return gateway.cloudRouter || null;
}

export function getForwardingRuleResources(
  gateway: GoogleVpnGateway,
  isSingleTunnel: boolean,
): { forwardingRules: ComputeForwardingRule[] } | null {
  if (!isSingleTunnel || !("forwardingRuleResources" in gateway)) return null;
  return gateway.forwardingRuleResources || null;
}

// ---------------------------------------------------------------------------
// AWS VPN tunnel extraction
// ---------------------------------------------------------------------------

/** Attributes of AWS VPN connection tunnel `n` (tunnel1 / tunnel2). */
export function awsTunnel(conn: VpnConnection, n: 1 | 2) {
  return n === 1
    ? {
        address: conn.tunnel1Address,
        presharedKey: conn.tunnel1PresharedKey,
        cgwInsideAddress: conn.tunnel1CgwInsideAddress,
        vgwInsideAddress: conn.tunnel1VgwInsideAddress,
      }
    : {
        address: conn.tunnel2Address,
        presharedKey: conn.tunnel2PresharedKey,
        cgwInsideAddress: conn.tunnel2CgwInsideAddress,
        vgwInsideAddress: conn.tunnel2VgwInsideAddress,
      };
}

export function extractAwsVpnTunnels(
  cgwVpns: ReturnType<typeof createAwsCustomerGateway>,
  isSingleTunnel: boolean,
): TunnelConfig[] {
  return cgwVpns.flatMap((cgw) => {
    const conn = cgw.vpnConnection;
    if (!conn) return [];

    return AWS_TUNNEL_INDEXES.map((n) => {
      const tunnel = awsTunnel(conn, n);
      return {
        address: tunnel.address,
        preshared_key: tunnel.presharedKey,
        apipaCidr: `${tunnel.cgwInsideAddress}/30`,
        peerAddress: isSingleTunnel ? tunnel.address : tunnel.vgwInsideAddress,
      };
    });
  });
}

export function createAwsVpnRoutes(
  scope: Construct,
  awsProvider: AwsProvider,
  vpnConnectionId: string,
  target: string,
  cidrBlock: string,
): void {
  if (!vpnConnectionId) {
    throw new Error(`VPN Connection ID not found for target: ${target}`);
  }

  createVpnConnectionRoutes(scope, awsProvider, {
    routes: [{ target, cidrBlock }],
    vpnConnectionId,
  });
}

// ---------------------------------------------------------------------------
// Helper: resolve a CloudWatch Log Group ARN created up-front by
// clouds/aws/index.ts (see cloudwatchlogs.ts for the naming convention).
// Throws if the log group is missing so that misconfiguration is caught
// early instead of silently disabling tunnel logging. Returns undefined when
// tunnel logs are disabled (customerGateways.<destination>.logs = false).
//
// Takes the full orchestrator output rather than a pre-extracted value, so
// callers only need to pass `awsResourcesOutput` through, not compute this
// themselves.
// ---------------------------------------------------------------------------

export function getCgwLogGroupArn(
  awsResourcesOutput: AwsResourcesOutput | undefined,
  destination: string,
): string | undefined {
  if (awsVpnparams.customerGateways[destination]?.logs === false) {
    return undefined;
  }
  const logGroupName = awsVpnparams.customerGateways[destination]?.logGroupName;
  const logGroup =
    awsResourcesOutput?.cloudwatchResources?.createdLogGroups[logGroupName];
  if (!logGroup) {
    throw new Error(
      `CloudWatch Log Group "${logGroupName}" not found. Make sure customerGateways.${destination}.logGroupName in vpn.ts matches a log group in cloudwatchlogs.ts.`,
    );
  }
  return logGroup.arn;
}

// ---------------------------------------------------------------------------
// Google VPN tunnel setup
//
// Shared by every "Google <-> X" connection (currently AWS and Azure). New
// "Google <-> NewCloud" connections should be able to call this directly.
// Parameters are grouped into an options object because this function is
// only used by the VPN modules under `resources/vpn/`, so changing its
// signature has no callers outside them to worry about.
// ---------------------------------------------------------------------------

export interface SetupGoogleVpnTunnelsParams {
  vpnGateway: GoogleVpnGateway;
  cloudRouter: ComputeRouter | null;
  peerAsn: number;
  destination: string;
  vpnParams: typeof googleVpnParams;
  vpnConnections: TunnelConfig[];
  isSingleTunnel: boolean;
  localCidr: string;
  peerCidr: string;
  vpcName: string;
  forwardingRuleResources: ReturnType<typeof getForwardingRuleResources>;
  labels?: { [key: string]: string };
}

export function setupGoogleVpnTunnels(
  scope: Construct,
  googleProvider: GoogleProvider,
  {
    vpnGateway,
    cloudRouter,
    peerAsn,
    destination,
    vpnParams,
    vpnConnections,
    isSingleTunnel,
    localCidr,
    peerCidr,
    vpcName,
    forwardingRuleResources,
    labels,
  }: SetupGoogleVpnTunnelsParams,
): ReturnType<typeof createGooglePeerTunnel> {
  const gatewayConfig = {
    vpnGatewayId: isSingleTunnel
      ? vpnGateway.vpnGateway?.selfLink || vpnGateway.vpnGateway?.id
      : vpnGateway.vpnGateway.id,
    peerAsn,
  };

  const externalVpnGateway = {
    // The construct ID keeps its original form so that renaming the gateway
    // in vpn.ts does not change its Terraform address.
    constructId: `${vpnParams.vpnGatewayName}-${destination}-external-gateway`,
    name: resourceName(
      vpnParams.peers?.[destination]?.externalGatewayName,
      "google",
      "external-vpn-gateway",
      destination,
    ),
    interfaces: vpnConnections.map((conn) => ({ ipAddress: conn.address })),
  };

  const vpnPeerParams = createGoogleVpnPeerParams(
    destination,
    vpnConnections.length,
    vpnParams.ikeVersion,
    cloudRouter,
    gatewayConfig,
    externalVpnGateway,
    vpnConnections,
    isSingleTunnel,
    localCidr,
    peerCidr,
    vpcName,
    forwardingRuleResources,
    labels,
  );

  return createGooglePeerTunnel(scope, googleProvider, {
    ...vpnPeerParams,
    customIpRanges: vpnParams.customIpRanges,
  });
}

// ---------------------------------------------------------------------------
// Azure VPN gateway APIPA addresses
//
// The Azure VPN gateway must own the Azure-side BGP address of every enabled
// pair that connects to Azure, per gateway instance. To add a pair with
// Azure, add one entry to AZURE_APIPA_SOURCES (order is kept in the result).
// ---------------------------------------------------------------------------

const AZURE_APIPA_SOURCES: ReadonlyArray<{
  peer: CloudId;
  addresses: (instance: number) => string[];
}> = [
  {
    peer: "aws",
    addresses: (i) =>
      vpnAddressPlan.awsAzure.tunnels[i]?.map((t) => t.azureIp) ?? [],
  },
  {
    peer: "google",
    addresses: (i) => {
      const tunnel = vpnAddressPlan.googleAzure.tunnels[i];
      return tunnel ? [tunnel.azureIp] : [];
    },
  },
];

/** Azure-side APIPA addresses per Azure VPN gateway instance. */
export function azureVngApipaAddresses(instanceCount = 2): string[][] {
  return Array.from({ length: instanceCount }, (_, i) =>
    AZURE_APIPA_SOURCES.filter((source) =>
      isConnected(source.peer, "azure"),
    ).flatMap((source) => source.addresses(i)),
  );
}
