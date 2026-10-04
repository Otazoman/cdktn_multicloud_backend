import { ComputeExternalVpnGateway } from "@cdktn/provider-google/lib/compute-external-vpn-gateway";
import { ComputeForwardingRule } from "@cdktn/provider-google/lib/compute-forwarding-rule";
import { ComputeRoute } from "@cdktn/provider-google/lib/compute-route";
import { ComputeRouterInterface } from "@cdktn/provider-google/lib/compute-router-interface";
import { ComputeRouterPeer } from "@cdktn/provider-google/lib/compute-router-peer";
import { ComputeVpnTunnel } from "@cdktn/provider-google/lib/compute-vpn-tunnel";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import { resourceName } from "../../utils/naming";

interface ExternalVpnGatewayParams {
  name: string;
  /** Construct ID (Terraform address). Defaults to `name` */
  constructId?: string;
  interfaces: { ipAddress: string }[];
}

interface TunnelConfig {
  preshared_key: string;
  apipaCidr?: string;
  peerAddress: string;
  ipAddress?: string;
}

interface GoogleVpnParams {
  /** Names in order (tunnel n, ...). Missing entries use the default name */
  names: {
    tunnelNames?: string[];
    routeNames?: string[];
    routerInterfaceNames?: string[];
    routerPeerNames?: string[];
  };
  tunnelCount: number;
  ikeVersion: number;
  routerName: string;
  vpnGateway: {
    vpnGatewayId: string;
    peerAsn: number;
  };
  vpnConnections: TunnelConfig[];
  externalVpnGateway: ExternalVpnGatewayParams;
  connectDestination: string;
  isSingleTunnel?: boolean;
  gcpVpcCidr: string;
  peerVpcCidr: string;
  gcpNetwork: string;
  forwardingRules?: ComputeForwardingRule[];
  customIpRanges?: string[];
  labels?: { [key: string]: string };
}

export function createGooglePeerTunnel(
  scope: Construct,
  provider: GoogleProvider,
  params: GoogleVpnParams
) {
  if (params.isSingleTunnel) {
    return createSingleTunnel(scope, provider, params);
  } else {
    return createHaTunnel(scope, provider, params);
  }
}

// Creates a single VPN tunnel
function createSingleTunnel(
  scope: Construct,
  provider: GoogleProvider,
  params: GoogleVpnParams
) {
  const forwardingRules = params.forwardingRules || [];

  // VPN Tunnels
  const vpnTunnels = params.vpnConnections.slice(0, 2).map((tunnel, index) => {
    // Include CloudSQL private service connection range in local traffic selector for dev environment
    const localTrafficSelector = [params.gcpVpcCidr];
    if (
      params.isSingleTunnel &&
      params.customIpRanges &&
      params.customIpRanges.length > 0
    ) {
      localTrafficSelector.push(...params.customIpRanges);
    }

    return new ComputeVpnTunnel(
      scope,
      `VpnTunnel-${params.connectDestination}-${index + 1}`,
      {
        provider,
        name: peerResourceName(params, "tunnelNames", "vpn-tunnel", index),
        targetVpnGateway: params.vpnGateway.vpnGatewayId,
        peerIp: tunnel.peerAddress,
        sharedSecret: tunnel.preshared_key,
        ikeVersion: params.ikeVersion,
        localTrafficSelector: localTrafficSelector,
        remoteTrafficSelector: [params.peerVpcCidr],
        labels: params.labels,
        dependsOn: forwardingRules,
      }
    );
  });

  // Add routes for VPN tunnels - Main VPC CIDR route
  const vpnRoutes = vpnTunnels.map((tunnel, index) => {
    return new ComputeRoute(
      scope,
      `${params.connectDestination}-RouteToPeerVpc-${index + 1}`,
      {
        provider: provider,
        name: peerResourceName(params, "routeNames", "vpn-route", index),
        destRange: params.peerVpcCidr,
        network: params.gcpNetwork,
        nextHopVpnTunnel: tunnel.id,
      }
    );
  });

  return {
    vpnTunnels,
    vpnRoutes,
  };
}

// Creates an HA VPN tunnel
function createHaTunnel(
  scope: Construct,
  provider: GoogleProvider,
  params: GoogleVpnParams
) {
  const isAws = params.connectDestination.toLowerCase() === "aws";
  const tunnelCount = isAws ? 4 : 2;

  // External VPN Gateway
  const externalVpnGateway = new ComputeExternalVpnGateway(
    scope,
    params.externalVpnGateway.constructId ?? params.externalVpnGateway.name,
    {
      provider: provider,
      name: params.externalVpnGateway.name,
      redundancyType: isAws ? "FOUR_IPS_REDUNDANCY" : "TWO_IPS_REDUNDANCY",
      interface: params.externalVpnGateway.interfaces
        .slice(0, tunnelCount)
        .map((iface, index) => ({
          id: index,
          ipAddress: iface.ipAddress,
        })),
      labels: params.labels,
    }
  );

  // VPN Tunnel
  const vpnTunnels = params.vpnConnections.slice(0, tunnelCount).map(
    (tunnel, index) =>
      new ComputeVpnTunnel(
        scope,
        `VpnTunnel-${params.connectDestination}-${index + 1}`,
        {
          provider,
          name: peerResourceName(params, "tunnelNames", "vpn-tunnel", index),
          vpnGateway: params.vpnGateway.vpnGatewayId,
          vpnGatewayInterface: isAws ? Math.floor(index / 2) : index,
          peerExternalGateway: externalVpnGateway.id,
          peerExternalGatewayInterface: isAws ? index : index % 2,
          sharedSecret: tunnel.preshared_key,
          router: params.routerName,
          ikeVersion: params.ikeVersion,
          labels: params.labels,
        }
      )
  );

  // Router Interfaces
  const routerInterfaces = vpnTunnels.map((tunnel, index) => {
    return new ComputeRouterInterface(
      scope,
      `RouterInterface-${params.connectDestination}-${index + 1}`,
      {
        provider,
        name: peerResourceName(
          params,
          "routerInterfaceNames",
          "router-interface",
          index,
        ),
        router: params.routerName,
        ...(isAws ? { ipRange: params.vpnConnections[index].apipaCidr } : {}),
        vpnTunnel: tunnel.name,
      }
    );
  });

  // Router Peers
  const routerPeers = routerInterfaces.map((routerInterface, index) => {
    const connection = params.vpnConnections[index];
    return new ComputeRouterPeer(
      scope,
      `RouterPeer-${params.connectDestination}-${index + 1}`,
      {
        provider,
        name: peerResourceName(
          params,
          "routerPeerNames",
          "router-peer",
          index,
        ),
        router: params.routerName,
        peerIpAddress: connection.peerAddress,
        peerAsn: params.vpnGateway.peerAsn,
        interface: routerInterface.name,
        advertisedRoutePriority: 100,
        ...(connection.ipAddress !== undefined && {
          ipAddress: connection.ipAddress,
        }),
      }
    );
  });

  return {
    externalVpnGateway,
    vpnTunnels,
    routerInterfaces,
    routerPeers,
  };
}

// Name of the n-th (0-based) resource of a kind for this peer
function peerResourceName(
  params: GoogleVpnParams,
  kind: keyof GoogleVpnParams["names"],
  type: string,
  index: number,
): string {
  return resourceName(
    params.names[kind]?.[index],
    "google",
    type,
    `${params.connectDestination}-${index + 1}`,
  );
}
