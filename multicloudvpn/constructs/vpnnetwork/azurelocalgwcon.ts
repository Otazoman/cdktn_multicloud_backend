import { LocalNetworkGateway } from "@cdktf/provider-azurerm/lib/local-network-gateway";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { VirtualNetworkGatewayConnection } from "@cdktf/provider-azurerm/lib/virtual-network-gateway-connection";
import { Construct } from "constructs";

interface TunnelConfig {
  localNetworkGatewayName: string;
  localGatewayAddress: string;
  localAddressSpaces: string[];
  sharedKey: string;
  bgpSettings?: {
    asn: number;
    bgpPeeringAddress: string;
  };
}

interface VpnGatewayParams {
  resourceGroupName: string;
  location: string;
  conneectDestination: string;
  virtualNetworkGatewayId: string;
  vpnConnectionType: string;
  tunnels: TunnelConfig[];
  isSingleTunnel: boolean;
}

export function createAzureLocalGateways(
  scope: Construct,
  provider: AzurermProvider,
  params: VpnGatewayParams
) {
  const resources = params.tunnels.map((tunnel, index) => {
    // Creating a Local Network Gateway
    const localNetworkGateway = new LocalNetworkGateway(
      scope,
      `local-gateway${params.conneectDestination}-${index}`,
      {
        name: `${tunnel.localNetworkGatewayName}-${index + 1}`,
        resourceGroupName: params.resourceGroupName,
        location: params.location,
        gatewayAddress: tunnel.localGatewayAddress,
        addressSpace: tunnel.localAddressSpaces,
        ...(params.isSingleTunnel
          ? {}
          : {
              bgpSettings: tunnel.bgpSettings
                ? {
                    asn: tunnel.bgpSettings.asn,
                    bgpPeeringAddress: tunnel.bgpSettings.bgpPeeringAddress,
                  }
                : undefined,
            }),
      }
    );

    // Creating a VPN Connection
    const vpnConnection = new VirtualNetworkGatewayConnection(
      scope,
      `azure-to${params.conneectDestination}-remote-${index}`,
      {
        provider: provider,
        name: `${tunnel.localNetworkGatewayName}-connection-${index + 1}`,
        resourceGroupName: params.resourceGroupName,
        location: params.location,
        type: params.vpnConnectionType,
        virtualNetworkGatewayId: params.virtualNetworkGatewayId,
        localNetworkGatewayId: localNetworkGateway.id,
        sharedKey: tunnel.sharedKey,
        enableBgp: !params.isSingleTunnel, // HA:true, Single:false
      }
    );

    return { localNetworkGateway, vpnConnection };
  });

  return resources;
}
