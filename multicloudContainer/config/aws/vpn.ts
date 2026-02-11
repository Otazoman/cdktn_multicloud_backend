/* VPN configuration parameters */
export const awsVpnparams = {
  bgpAwsAsn: 64512,
  logRetentionDays: 14,
  propageteRouteTableNames: [
    "my-aws-vpc-private-routetable",
    "my-aws-vpc-public-routetable",
  ],
  vpnGatewayTags: {
    Project: "MultiCloud",
  },
  customerGatewayTags: {
    Project: "MultiCloud",
  },
};

export const createCustomerGatewayParams = (
  conneectDestination: string,
  bgpAsn: number,
  vpnGatewayId: any,
  IpAddresses: string[],
  isSingleTunnel: boolean,
  tags?: { [key: string]: string }
) => ({
  customerGatewayName: `my-aws-vpc-aws-${conneectDestination}-cgw`,
  vpnConnectionName: `my-aws-vpc-aws-${conneectDestination}-vpn-connection`,
  conneectDestination: conneectDestination,
  tags: tags,
  awsVpnCgwProps: {
    bgpAsn: bgpAsn,
    type: "ipsec.1",
  },
  logRetentionDays: awsVpnparams.logRetentionDays,
  vpnGatewayId: vpnGatewayId,
  awsVpnGatewayIpAddresses: IpAddresses,
  isSingleTunnel: isSingleTunnel,
});
