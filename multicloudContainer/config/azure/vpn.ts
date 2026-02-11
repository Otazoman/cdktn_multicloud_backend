import { RESOURCE_GROUP, VNET_NAME, azureCommonparams } from './common';

/* VPN configuration parameters */
export const azureVpnparams = {
  gatewaySubnetCidr: "10.2.100.0/24",
  publicIpNames: ["vpn-gateway-ip-1", "vpn-gateway-ip-2"],
  type: "Vpn",
  vpnType: "RouteBased",
  sku: "VpnGw1",
  azureAsn: 65515,
  vpnConnectionType: "IPsec",
  pipAlloc: "Dynamic",
  retentionInDays: 30,
  vpnGwtags: {
    project: "multicloud-vpn",
    resource: "vpngw",
  },
  localGwtags: {
    project: "multicloud-vpn",
    resource: "localgw",
  },
};

export const azureAwsVpnparams = {
  conneectDestination: "aws",
  azureAwsGwIp1ip1: "169.254.21.1",
  azureAwsGwIp1ip2: "169.254.21.5",
  azureAwsGwIp2ip1: "169.254.22.1",
  azureAwsGwIp2ip2: "169.254.22.5",
  awsGwIp1Cidr: ["169.254.21.0/30", "169.254.22.0/30"],
  awsGwIp2Cidr: ["169.254.21.4/30", "169.254.22.4/30"],
  awsGwIp1ip1: "169.254.21.2",
  awsGwIp1ip2: "169.254.21.6",
  awsGwIp2ip1: "169.254.22.2",
  awsGwIp2ip2: "169.254.22.6",
};
export const azureGoogleVpnparams = {
  conneectDestination: "google",
  googleGwIp1: "169.254.21.9",
  googleGwIp2: "169.254.22.9",
  googlePeerIp1: "169.254.21.10",
  googlePeerIp2: "169.254.22.10",
  presharedKey: "test#01",
};

export const azureVpnGatewayParams = {
  resourceGroupName: RESOURCE_GROUP,
  virtualNetworkName: VNET_NAME,
  VpnGatewayName: `${VNET_NAME}-vng`,
  gatewaySubnetCidr: azureVpnparams.gatewaySubnetCidr,
  publicIpNames: azureVpnparams.publicIpNames,
  location: azureCommonparams.location,
  vpnProps: {
    type: azureVpnparams.type,
    vpnType: azureVpnparams.vpnType,
    sku: azureVpnparams.sku,
    azureAsn: azureVpnparams.azureAsn,
    pipAlloc: azureVpnparams.pipAlloc,
    awsGwIp1ip1: azureAwsVpnparams.awsGwIp1ip1,
    awsGwIp1ip2: azureAwsVpnparams.awsGwIp1ip2,
    awsGwIp2ip1: azureAwsVpnparams.awsGwIp2ip1,
    awsGwIp2ip2: azureAwsVpnparams.awsGwIp2ip2,
    googleGWip1: azureGoogleVpnparams.googleGwIp1,
    googleGWip2: azureGoogleVpnparams.googleGwIp2,
    googlePeerIp1: azureGoogleVpnparams.googlePeerIp1,
    googlePeerIp2: azureGoogleVpnparams.googlePeerIp2,
  },
  diagnosticSettings: {
    retentionInDays: azureVpnparams.retentionInDays,
  },
};

export const createLocalGatewayParams = (
  virtualNetworkGatewayId: string,
  conneectDestination: string,
  tunnels: Array<any>,
  isSingleTunnel: boolean,
  awsToAzure: boolean,
  awsToGoogle: boolean,
  googleToAzure: boolean,
  awsVpcCidr?: string,
  googleVpcCidr?: string,
  tags?: { [key: string]: string }
) => ({
  resourceGroupName: azureCommonparams.resourceGroup,
  location: azureCommonparams.location,
  conneectDestination: conneectDestination,
  virtualNetworkGatewayId: virtualNetworkGatewayId,
  vpnConnectionType: azureVpnparams.vpnConnectionType,
  tunnels: tunnels,
  isSingleTunnel: isSingleTunnel,
  awsToAzure: awsToAzure,
  awsToGoogle: awsToGoogle,
  googleToAzure: googleToAzure,
  awsVpcCidr: awsVpcCidr,
  googleVpcCidr: googleVpcCidr,
  tags: tags,
});