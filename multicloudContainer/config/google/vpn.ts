/* VPN configuration parameters */
export const googleVpnParams = {
  connectDestination: "common",
  vpnGatewayName: "google-vpn-gateway",
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
  vpnTnnelname: `multicloud-gcp-vpc-gcp-${connectDestination}-vpn-tunnel`,
  routerInterfaceName: `multicloud-gcp-vpc-gcp-${connectDestination}-router-interface`,
  routerPeerName: `multicloud-gcp-vpc-gcp-${connectDestination}-router-peer`,
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
