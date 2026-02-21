import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { PublicIp } from "@cdktn/provider-azurerm/lib/public-ip";
import { RouteServer } from "@cdktn/provider-azurerm/lib/route-server";
import { RouteServerBgpConnection } from "@cdktn/provider-azurerm/lib/route-server-bgp-connection";
import { Subnet } from "@cdktn/provider-azurerm/lib/subnet";
import { Construct } from "constructs";

interface AzureRouteServerParams {
  resourceGroupName: string;
  virtualNetworkName: string;
  location: string;
  routeServerName: string;
  routeServerSubnetCidr: string;
  vpnGatewayId: string;
  routeServerAsn: number;
  vpnGatewayBgpSettings: {
    asn: number;
    bgpPeeringAddress1: string;
    bgpPeeringAddress2: string;
  };
  awsVpnGatewayBgpSettings?: {
    enabled: boolean;
    peerAsn: number;
    peerIpAddresses: string[];
    connectionNames: string[];
  };
  googleVpnGatewayBgpSettings?: {
    enabled: boolean;
    peerAsn: number;
    peerIpAddresses: string[];
    connectionNames: string[];
  };
}

export function createAzureRouteServer(
  scope: Construct,
  provider: AzurermProvider,
  params: AzureRouteServerParams
) {
  // RouteServerSubnet
  const routeServerSubnet = new Subnet(scope, "azure_route_server_subnet", {
    provider: provider,
    resourceGroupName: params.resourceGroupName,
    virtualNetworkName: params.virtualNetworkName,
    name: "RouteServerSubnet",
    addressPrefixes: [params.routeServerSubnetCidr],
  });

  // Route Server Public IP
  const routeServerPublicIp = new PublicIp(
    scope,
    "azure_route_server_public_ip",
    {
      provider: provider,
      name: `${params.routeServerName}-pip`,
      resourceGroupName: params.resourceGroupName,
      location: params.location,
      allocationMethod: "Static",
      sku: "Standard",
    }
  );

  // Route Server
  const routeServer = new RouteServer(scope, "azure_route_server", {
    provider: provider,
    name: params.routeServerName,
    resourceGroupName: params.resourceGroupName,
    location: params.location,
    sku: "Standard",
    subnetId: routeServerSubnet.id,
    publicIpAddressId: routeServerPublicIp.id,
    branchToBranchTrafficEnabled: true,
    hubRoutingPreference: "VpnGateway",
    tags: {
      Purpose: "Hub-Spoke-BGP-Control",
      Environment: "Production",
    },
  });

  const bgpConnections: RouteServerBgpConnection[] = [];

  // VPN Gateway BGP Peering Address 1
  const bgpConnection1 = new RouteServerBgpConnection(
    scope,
    "azure_route_server_bgp_connection_1",
    {
      provider: provider,
      name: `${params.routeServerName}-bgp-1`,
      routeServerId: routeServer.id,
      peerAsn: params.vpnGatewayBgpSettings.asn, // Assuming this is different from routeServerAsn
      peerIp: params.vpnGatewayBgpSettings.bgpPeeringAddress1,
    }
  );
  bgpConnections.push(bgpConnection1);

  // VPN Gateway BGP Peering Address 2
  const bgpConnection2 = new RouteServerBgpConnection(
    scope,
    "azure_route_server_bgp_connection_2",
    {
      provider: provider,
      name: `${params.routeServerName}-bgp-2`,
      routeServerId: routeServer.id,
      peerAsn: params.vpnGatewayBgpSettings.asn, // Assuming this is different from routeServerAsn
      peerIp: params.vpnGatewayBgpSettings.bgpPeeringAddress2,
    }
  );
  bgpConnections.push(bgpConnection2);

  // AWS VPN Gateway BGP Peering
  if (
    params.awsVpnGatewayBgpSettings?.enabled &&
    params.awsVpnGatewayBgpSettings.peerIpAddresses.length > 0
  ) {
    params.awsVpnGatewayBgpSettings.peerIpAddresses.forEach((ip, index) => {
      const bgpConnection = new RouteServerBgpConnection(
        scope,
        `azure_route_server_aws_bgp_connection_${index}`,
        {
          provider: provider,
          name: params.awsVpnGatewayBgpSettings!.connectionNames[index],
          routeServerId: routeServer.id,
          peerAsn: params.awsVpnGatewayBgpSettings!.peerAsn,
          peerIp: ip,
        }
      );
      bgpConnections.push(bgpConnection);
    });
  }

  // Google VPN Gateway BGP Peering
  if (
    params.googleVpnGatewayBgpSettings?.enabled &&
    params.googleVpnGatewayBgpSettings.peerIpAddresses.length > 0
  ) {
    params.googleVpnGatewayBgpSettings.peerIpAddresses.forEach((ip, index) => {
      const bgpConnection = new RouteServerBgpConnection(
        scope,
        `azure_route_server_google_bgp_connection_${index}`,
        {
          provider: provider,
          name: params.googleVpnGatewayBgpSettings!.connectionNames[index],
          routeServerId: routeServer.id,
          peerAsn: params.googleVpnGatewayBgpSettings!.peerAsn,
          peerIp: ip,
        }
      );
      bgpConnections.push(bgpConnection);
    });
  }

  return {
    routeServer,
    routeServerSubnet,
    routeServerPublicIp,
    bgpConnections,
  };
}
