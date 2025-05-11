import { LocalNetworkGateway } from "@cdktf/provider-azurerm/lib/local-network-gateway";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { VirtualNetworkGatewayConnection } from "@cdktf/provider-azurerm/lib/virtual-network-gateway-connection";
import { Construct } from "constructs";

interface AzureGatewayResources {
  localGateways: LocalNetworkGateway[];
  vpnConnections: VirtualNetworkGatewayConnection[];
}

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
  batchSize?: number;
}

export function createAzureLocalGateways(
  scope: Construct,
  provider: AzurermProvider,
  params: VpnGatewayParams
) {
  // Batch processing
  const allResources: AzureGatewayResources[] = [];
  const batchSize = params.batchSize || 2;

  for (let i = 0; i < params.tunnels.length; i += batchSize) {
    const batch = params.tunnels.slice(i, i + batchSize);
    const batchResources = createBatch(scope, provider, params, batch, i);

    if (i > 0) {
      batchResources.vpnConnections.forEach((conn) => {
        conn.node.addDependency(
          allResources[allResources.length - 1].vpnConnections
        );
      });
    }

    allResources.push(batchResources);
  }

  return allResources.flat();
}

function createBatch(
  scope: Construct,
  provider: AzurermProvider,
  params: VpnGatewayParams,
  tunnels: TunnelConfig[],
  offset: number
) {
  // Create local gateways and VPN connections
  const localGateways = tunnels.map((tunnel, index) => {
    const gateway = new LocalNetworkGateway(
      scope,
      `local-gateway-${params.conneectDestination}-${offset + index}`,
      {
        name: `${tunnel.localNetworkGatewayName}-${offset + index + 1}`,
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
        timeouts: {
          create: "30m",
          update: "30m",
          delete: "30m",
        },
      }
    );
    return gateway;
  });
  // Create VPN connections
  const vpnConnections = tunnels.map((tunnel, index) => {
    const connection = new VirtualNetworkGatewayConnection(
      scope,
      `azure-to-${params.conneectDestination}-remote-${offset + index}`,
      {
        provider,
        name: `${tunnel.localNetworkGatewayName}-connection-${
          offset + index + 1
        }`,
        resourceGroupName: params.resourceGroupName,
        location: params.location,
        type: params.vpnConnectionType,
        virtualNetworkGatewayId: params.virtualNetworkGatewayId,
        localNetworkGatewayId: localGateways[index].id,
        sharedKey: tunnel.sharedKey,
        enableBgp: !params.isSingleTunnel,
        timeouts: {
          create: "30m",
          update: "30m",
          delete: "30m",
        },
      }
    );

    return connection;
  });

  return { localGateways, vpnConnections };
}
