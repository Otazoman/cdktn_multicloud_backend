/* VPN configuration parameters */
export const awsVpnparams = {
  bgpAwsAsn: 64512,
  vpnGatewayName: "my-aws-vpc-vgw",
  // Per connection destination. One Customer Gateway / VPN connection is
  // created per peer gateway IP (single tunnel: 1, HA: 2); names are used in
  // order. Omitted names default to <project>-aws-cgw-<destination>-<n> /
  // <project>-aws-vpn-connection-<destination>-<n>.
  // logGroupName must match a log group in cloudwatchlogs.ts (retention is
  // set there). logs: tunnel activity logs on/off. logOutputFormat: "text" or
  // "json" - changing it on existing tunnels interrupts each tunnel for
  // several minutes.
  customerGateways: {
    google: {
      customerGatewayNames: [
        "my-aws-vpc-aws-google-cgw-1",
        "my-aws-vpc-aws-google-cgw-2",
      ],
      vpnConnectionNames: [
        "my-aws-vpc-aws-google-vpn-connection-1",
        "my-aws-vpc-aws-google-vpn-connection-2",
      ],
      logGroupName: "my-aws-vpc-aws-google-cgw-log-group",
      logs: true,
      logOutputFormat: "text",
    },
    azure: {
      customerGatewayNames: [
        "my-aws-vpc-aws-azure-cgw-1",
        "my-aws-vpc-aws-azure-cgw-2",
      ],
      vpnConnectionNames: [
        "my-aws-vpc-aws-azure-vpn-connection-1",
        "my-aws-vpc-aws-azure-vpn-connection-2",
      ],
      logGroupName: "my-aws-vpc-aws-azure-cgw-log-group",
      logs: true,
      logOutputFormat: "text",
    },
  } as Record<
    string,
    {
      customerGatewayNames?: string[];
      vpnConnectionNames?: string[];
      logGroupName: string;
      logs: boolean;
      logOutputFormat?: "text" | "json";
    }
  >,
  propagateRouteTableNames: [
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
  connectDestination: string,
  bgpAsn: number,
  vpnGatewayId: any,
  IpAddresses: string[],
  isSingleTunnel: boolean,
  // ARN of the CloudWatch Log Group created up-front for this Customer
  // Gateway's tunnel logs (see cloudwatchlogs.ts / clouds/aws/index.ts).
  // Undefined when tunnel logs are disabled (customerGateways.<dest>.logs).
  logGroupArn: string | undefined,
  tags?: { [key: string]: string },
) => ({
  customerGatewayNames:
    awsVpnparams.customerGateways[connectDestination]?.customerGatewayNames ??
    [],
  vpnConnectionNames:
    awsVpnparams.customerGateways[connectDestination]?.vpnConnectionNames ??
    [],
  connectDestination: connectDestination,
  tags: tags,
  awsVpnCgwProps: {
    bgpAsn: bgpAsn,
    type: "ipsec.1",
  },
  logGroupArn: logGroupArn,
  logOutputFormat:
    awsVpnparams.customerGateways[connectDestination]?.logOutputFormat,
  vpnGatewayId: vpnGatewayId,
  awsVpnGatewayIpAddresses: IpAddresses,
  isSingleTunnel: isSingleTunnel,
});
