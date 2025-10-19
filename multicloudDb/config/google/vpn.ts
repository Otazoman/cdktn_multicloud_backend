/* VPN configuration parameters */
export const googleVpnParams = {
  connectDestination: "common",
  vpnGatewayName: "google-vpn-gateway",
  cloudRouterName: "google-cloud-router",
  bgpGoogleAsn: 65000,
  ikeVersion: 2,
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
  labels?: { [key: string]: string } | undefined
) => ({
  connectDestination: connectDestination,
  vpnTnnelname: `my-gcp-vpc-gcp-${connectDestination}-vpn-tunnel`,
  routerInterfaceName: `my-gcp-vpc-gcp-${connectDestination}-router-interface`,
  routerPeerName: `my-gcp-vpc-gcp-${connectDestination}-router-peer`,
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
