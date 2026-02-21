import { LocalNetworkGateway } from "@cdktn/provider-azurerm/lib/local-network-gateway";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { VirtualNetworkGatewayConnection } from "@cdktn/provider-azurerm/lib/virtual-network-gateway-connection";
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
  tags?: { [key: string]: string };
}

// Batch processing for creating Azure Local Gateways
export function createAzureLocalGateways(
  scope: Construct,
  provider: AzurermProvider,
  params: VpnGatewayParams
) {
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

// Create local gateways and VPN connections in a batch
function createBatch(
  scope: Construct,
  provider: AzurermProvider,
  params: VpnGatewayParams,
  tunnels: TunnelConfig[],
  offset: number
) {
  const localGateways = tunnels.map((tunnel, index) => {
    const gateway = new LocalNetworkGateway(
      scope,
      `local-gateway-${params.conneectDestination}-${offset + index}`,
      {
        name: `${tunnel.localNetworkGatewayName}-${offset + index + 1}`,
        resourceGroupName: params.resourceGroupName,
        location: params.location,
        gatewayAddress: tunnel.localGatewayAddress,

        ...(params.isSingleTunnel
          ? { addressSpace: tunnel.localAddressSpaces }
          : {
              bgpSettings: tunnel.bgpSettings
                ? {
                    asn: tunnel.bgpSettings.asn,
                    bgpPeeringAddress: tunnel.bgpSettings.bgpPeeringAddress,
                  }
                : undefined,
            }),
        tags: params.tags,
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
        tags: params.tags,
      }
    );

    return connection;
  });

  return { localGateways, vpnConnections };
}
