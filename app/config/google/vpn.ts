/* VPN configuration parameters */
export const googleVpnParams = {
  connectDestination: "common",
  vpnGatewayName: "google-vpn-gateway",
  // Single tunnel: gateway IP and forwarding rules
  gatewayIpName: "google-vpn-gateway-ip",
  forwardingRuleNames: {
    esp: "fr-common-google-vpn-gateway-esp",
    udp500: "fr-common-google-vpn-gateway-udp500",
    udp4500: "fr-common-google-vpn-gateway-udp4500",
  } as Record<string, string>,
  // HA: external IP addresses
  haIpNames: ["google-vpn-gateway-ha-ip-0", "google-vpn-gateway-ha-ip-1"],
  // Per peer cloud. Names are used in order (tunnel n, interface n, ...).
  // Omitted names default to <project>-google-<type>-<peer>-<n>.
  peers: {
    aws: {
      externalGatewayName: "google-vpn-gateway-aws-external-gateway",
      tunnelNames: [
        "multicloud-gcp-vpc-gcp-aws-vpn-tunnel-1",
        "multicloud-gcp-vpc-gcp-aws-vpn-tunnel-2",
        "multicloud-gcp-vpc-gcp-aws-vpn-tunnel-3",
        "multicloud-gcp-vpc-gcp-aws-vpn-tunnel-4",
      ],
      // Static routes (single tunnel only)
      routeNames: [
        "multicloud-gcp-vpc-gcp-aws-vpn-tunnel-route-to-peer-1",
        "multicloud-gcp-vpc-gcp-aws-vpn-tunnel-route-to-peer-2",
      ],
      routerInterfaceNames: [
        "multicloud-gcp-vpc-gcp-aws-router-interface-1",
        "multicloud-gcp-vpc-gcp-aws-router-interface-2",
        "multicloud-gcp-vpc-gcp-aws-router-interface-3",
        "multicloud-gcp-vpc-gcp-aws-router-interface-4",
      ],
      routerPeerNames: [
        "multicloud-gcp-vpc-gcp-aws-router-peer-1",
        "multicloud-gcp-vpc-gcp-aws-router-peer-2",
        "multicloud-gcp-vpc-gcp-aws-router-peer-3",
        "multicloud-gcp-vpc-gcp-aws-router-peer-4",
      ],
    },
    azure: {
      externalGatewayName: "google-vpn-gateway-azure-external-gateway",
      tunnelNames: [
        "multicloud-gcp-vpc-gcp-azure-vpn-tunnel-1",
        "multicloud-gcp-vpc-gcp-azure-vpn-tunnel-2",
      ],
      // Static routes (single tunnel only)
      routeNames: [
        "multicloud-gcp-vpc-gcp-azure-vpn-tunnel-route-to-peer-1",
        "multicloud-gcp-vpc-gcp-azure-vpn-tunnel-route-to-peer-2",
      ],
      routerInterfaceNames: [
        "multicloud-gcp-vpc-gcp-azure-router-interface-1",
        "multicloud-gcp-vpc-gcp-azure-router-interface-2",
      ],
      routerPeerNames: [
        "multicloud-gcp-vpc-gcp-azure-router-peer-1",
        "multicloud-gcp-vpc-gcp-azure-router-peer-2",
      ],
    },
  } as Record<
    string,
    {
      externalGatewayName?: string;
      tunnelNames?: string[];
      routeNames?: string[];
      routerInterfaceNames?: string[];
      routerPeerNames?: string[];
    }
  >,
  cloudRouterName: "google-cloud-router",
  bgpGoogleAsn: 65000,
  ikeVersion: 2,
  customIpRanges: ["10.100.0.0/16", "35.199.192.0/19"], // Custom IP ranges for Cloud Router: CloudSQL and Google DNS
  labels: {
    owner: "team-a",
  },
};

export const createGoogleVpnPeerParams = (
  connectDestination: string,
  tunnelCount: number,
  ikeVersion: number,
  cloudRouter: any,
  vpnGateway: any,
  externalVpnGateway: any,
  vpnConnections: any,
  isSingleTunnel: boolean,
  gcpVpcCidr: string,
  peerVpcCidr: string,
  gcpNetwork: string,
  forwardingRuleResources: any,
  labels?: { [key: string]: string } | undefined,
) => ({
  connectDestination: connectDestination,
  names: googleVpnParams.peers[connectDestination] ?? {},
  tunnelCount: tunnelCount,
  ikeVersion: ikeVersion,
  routerName: cloudRouter?.name || "",
  cloudRouter: cloudRouter,
  vpnGateway: vpnGateway,
  externalVpnGateway: externalVpnGateway,
  vpnConnections: vpnConnections,
  isSingleTunnel: isSingleTunnel,
  gcpVpcCidr: gcpVpcCidr,
  peerVpcCidr: peerVpcCidr,
  gcpNetwork: gcpNetwork,
  forwardingRuleResources: forwardingRuleResources,
  labels: labels,
});
