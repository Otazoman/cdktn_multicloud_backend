import { LocalNetworkGateway } from "@cdktn/provider-azurerm/lib/local-network-gateway";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { VirtualNetworkGatewayConnection } from "@cdktn/provider-azurerm/lib/virtual-network-gateway-connection";
import { Construct } from "constructs";
import { resourceName } from "../../utils/naming";
import { addTerraformDependency } from "../../utils/terraformDependency";

interface AzureGatewayResources {
  localGateways: LocalNetworkGateway[];
  vpnConnections: VirtualNetworkGatewayConnection[];
}

interface TunnelConfig {
  localGatewayAddress: string;
  localAddressSpaces: string[];
  sharedKey: string;
  bgpSettings?: {
    asn: number;
    bgpPeeringAddress: string;
  };
  // Azure APIPA BGP addresses to use for this connection (primary: instance 1,
  // secondary: instance 2). Required when the VNG has multiple custom APIPA
  // addresses; otherwise Azure uses the first APIPA address for every connection.
  customBgpAddresses?: {
    primary: string;
    secondary?: string;
  };
}

interface VpnGatewayParams {
  resourceGroupName: string;
  location: string;
  connectDestination: string;
  virtualNetworkGatewayId: string;
  vpnConnectionType: string;
  tunnels: TunnelConfig[];
  /** Names in tunnel order. Missing entries use the default name */
  gatewayNames?: string[];
  connectionNames?: string[];
  isSingleTunnel: boolean;
  batchSize?: number;
  tags?: { [key: string]: string };
}

// Batch processing for creating Azure Local Gateways
export function createAzureLocalGateways(
  scope: Construct,
  provider: AzurermProvider,
  params: VpnGatewayParams,
) {
  const allResources: AzureGatewayResources[] = [];
  const batchSize = params.batchSize || 2;

  for (let i = 0; i < params.tunnels.length; i += batchSize) {
    const batch = params.tunnels.slice(i, i + batchSize);
    const batchResources = createBatch(scope, provider, params, batch, i);

    if (i > 0) {
      batchResources.vpnConnections.forEach((conn) => {
        addTerraformDependency(
          conn,
          allResources[allResources.length - 1].vpnConnections,
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
  offset: number,
) {
  const localGateways = tunnels.map((tunnel, index) => {
    const gateway = new LocalNetworkGateway(
      scope,
      `local-gateway-${params.connectDestination}-${offset + index}`,
      {
        name: resourceName(
          params.gatewayNames?.[offset + index],
          "azure",
          "lng",
          `${params.connectDestination}-${offset + index + 1}`,
        ),
        resourceGroupName: params.resourceGroupName,
        location: params.location,
        gatewayAddress: tunnel.localGatewayAddress,

        ...(params.isSingleTunnel
          ? buildSingleTunnelLocalGatewayConfig(tunnel)
          : buildHaLocalGatewayConfig(tunnel)),
        tags: params.tags,
      },
    );
    return gateway;
  });

  // Create VPN connections
  const vpnConnections = tunnels.map((tunnel, index) => {
    const connection = new VirtualNetworkGatewayConnection(
      scope,
      `azure-to-${params.connectDestination}-remote-${offset + index}`,
      {
        provider,
        name: resourceName(
          params.connectionNames?.[offset + index],
          "azure",
          "vpn-connection",
          `${params.connectDestination}-${offset + index + 1}`,
        ),
        resourceGroupName: params.resourceGroupName,
        location: params.location,
        type: params.vpnConnectionType,
        virtualNetworkGatewayId: params.virtualNetworkGatewayId,
        localNetworkGatewayId: localGateways[index].id,
        sharedKey: tunnel.sharedKey,
        ...(params.isSingleTunnel
          ? buildSingleTunnelConnectionConfig()
          : buildHaConnectionConfig(tunnel)),
        tags: params.tags,
      },
    );

    return connection;
  });

  return { localGateways, vpnConnections };
}

// Single tunnel (dev): static routing via the local address spaces
function buildSingleTunnelLocalGatewayConfig(tunnel: TunnelConfig) {
  return { addressSpace: tunnel.localAddressSpaces };
}

// HA (prod): dynamic routing via BGP
function buildHaLocalGatewayConfig(tunnel: TunnelConfig) {
  return {
    bgpSettings: tunnel.bgpSettings
      ? {
          asn: tunnel.bgpSettings.asn,
          bgpPeeringAddress: tunnel.bgpSettings.bgpPeeringAddress,
        }
      : undefined,
  };
}

// Single tunnel (dev): BGP disabled
function buildSingleTunnelConnectionConfig() {
  return { bgpEnabled: false };
}

// HA (prod): BGP enabled, with the Azure APIPA addresses to use if specified
function buildHaConnectionConfig(tunnel: TunnelConfig) {
  return {
    bgpEnabled: true,
    ...(tunnel.customBgpAddresses
      ? { customBgpAddresses: tunnel.customBgpAddresses }
      : {}),
  };
}
