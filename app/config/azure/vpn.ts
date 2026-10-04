import { azureCommonparams } from "./common";

/* VPN configuration parameters */
export const azureVpnparams = {
  gatewaySubnetCidr: "10.2.100.0/24",
  vpnGatewayName: "my-azure-vnet-vng",
  publicIpNames: ["vpn-gateway-ip-1", "vpn-gateway-ip-2"],
  // VPN gateway IP configurations (sub-resources), one per instance
  ipConfigurationNames: ["vnetGatewayConfig-1", "vnetGatewayConfig-2"],
  diagnosticSettingName: "my-azure-vnet-vng-diagnostic-setting",
  // Local network gateways / connections per peer cloud, in tunnel order.
  // Omitted names default to <project>-azure-lng-<peer>-<n> /
  // <project>-azure-vpn-connection-<peer>-<n>.
  localNetworkGateways: {
    aws: {
      gatewayNames: [
        "my-azure-vnet-aws-lng-1",
        "my-azure-vnet-aws-lng-2",
        "my-azure-vnet-aws-lng-3",
        "my-azure-vnet-aws-lng-4",
      ],
      connectionNames: [
        "my-azure-vnet-aws-lng-connection-1",
        "my-azure-vnet-aws-lng-connection-2",
        "my-azure-vnet-aws-lng-connection-3",
        "my-azure-vnet-aws-lng-connection-4",
      ],
    },
    google: {
      gatewayNames: [
        "my-azure-vnet-google-lng-1",
        "my-azure-vnet-google-lng-2",
      ],
      connectionNames: [
        "my-azure-vnet-google-lng-connection-1",
        "my-azure-vnet-google-lng-connection-2",
      ],
    },
  } as Record<string, { gatewayNames?: string[]; connectionNames?: string[] }>,
  type: "Vpn",
  vpnType: "RouteBased",
  sku: "VpnGw1AZ",
  azureAsn: 65515,
  vpnConnectionType: "IPsec",
  pipAlloc: "Dynamic",
  /**
   * Availability Zones for VPN Gateway Public IPs.
   * Required when using AZ SKUs (VpnGw1AZ, VpnGw2AZ, etc.).
   * ["1","2","3"] = zone-redundant (recommended for production HA).
   * Set to undefined or [] if using non-AZ SKUs (VpnGw1, VpnGw2, etc.).
   */
  publicIpZones: ["1", "2", "3"],
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

export const createLocalGatewayParams = (
  virtualNetworkGatewayId: string,
  connectDestination: string,
  tunnels: Array<any>,
  isSingleTunnel: boolean,
  tags?: { [key: string]: string },
) => ({
  resourceGroupName: azureCommonparams.resourceGroup,
  location: azureCommonparams.location,
  connectDestination: connectDestination,
  virtualNetworkGatewayId: virtualNetworkGatewayId,
  vpnConnectionType: azureVpnparams.vpnConnectionType,
  tunnels: tunnels,
  gatewayNames:
    azureVpnparams.localNetworkGateways[connectDestination]?.gatewayNames,
  connectionNames:
    azureVpnparams.localNetworkGateways[connectDestination]?.connectionNames,
  isSingleTunnel: isSingleTunnel,
  tags: tags,
});
