import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { VirtualHub } from "@cdktf/provider-azurerm/lib/virtual-hub";
import { VirtualWan } from "@cdktf/provider-azurerm/lib/virtual-wan";
import { VpnGateway } from "@cdktf/provider-azurerm/lib/vpn-gateway";
import { VpnGatewayConnection } from "@cdktf/provider-azurerm/lib/vpn-gateway-connection";
import { VpnSite } from "@cdktf/provider-azurerm/lib/vpn-site";
import { Construct } from "constructs";

export interface AzureVirtualWanProps {
  name: string;
  resourceGroupName: string;
  location: string;
  allowBranchToBranchTraffic?: boolean;
  disableVpnEncryption?: boolean;
  virtualHubName: string;
  virtualHubAddressPrefix: string;
  hubBgpAsn: number;

  virtualHubVpnGatewayName: string;
  scaleUnit?: number;

  awsVpnSiteName: string;
  awsVpnSiteLinkName: string;
  awsVpnSiteLinkIpAddress: string;
  awsVpnSiteBgpAsn: number;
  awsVpnSiteLinkBgpAddress: string;
  awsVpnSiteLinkPresharedKey: string;

  googleVpnSiteName: string;
  googleVpnSiteLinkName: string;
  googleVpnSiteLinkIpAddress: string;
  googleVpnSiteBgpAsn: number;
  googleVpnSiteLinkBgpAddress: string;
  googleVpnSiteLinkPresharedKey: string;

  awsToAzure: boolean;
  googleToAzure: boolean;
}

export function createAzureVirtualWan(
  scope: Construct,
  azurermProvider: AzurermProvider,
  props: AzureVirtualWanProps
) {
  // 1. Virtual WAN & Hub 作成
  const virtualWan = new VirtualWan(scope, `${props.name}-vwan`, {
    name: props.name,
    resourceGroupName: props.resourceGroupName,
    location: props.location,
    allowBranchToBranchTraffic: props.allowBranchToBranchTraffic,
    disableVpnEncryption: props.disableVpnEncryption,
    provider: azurermProvider,
  });

  const virtualHub = new VirtualHub(scope, `${props.virtualHubName}-hub`, {
    name: props.virtualHubName,
    resourceGroupName: props.resourceGroupName,
    location: props.location,
    virtualWanId: virtualWan.id,
    addressPrefix: props.virtualHubAddressPrefix,
    provider: azurermProvider,
  });

  // 2. VPN Gateway（Site-to-Site 接続用）を作成
  const vpnGateway = new VpnGateway(scope, props.virtualHubVpnGatewayName, {
    name: props.virtualHubVpnGatewayName,
    resourceGroupName: props.resourceGroupName,
    location: props.location,
    virtualHubId: virtualHub.id,
    // Optional: scaleUnit 等
    scaleUnit: props.scaleUnit,
    enableBgp: true,
    bgpAsn: props.hubBgpAsn,
    provider: azurermProvider,
  });

  // 3. AWS サイト接続 (オプション)
  let awsVpnSite: VpnSite | undefined;
  let awsVpnConnection: VpnGatewayConnection | undefined;
  if (props.awsToAzure) {
    awsVpnSite = new VpnSite(scope, props.awsVpnSiteName, {
      name: props.awsVpnSiteName,
      resourceGroupName: props.resourceGroupName,
      location: props.location,
      virtualWanId: virtualWan.id,
      link: [
        {
          name: props.awsVpnSiteLinkName,
          ipAddress: props.awsVpnSiteLinkIpAddress,
          bgp: {
            asn: props.awsVpnSiteBgpAsn,
            peeringAddress: props.awsVpnSiteLinkBgpAddress,
          },
        },
      ],
      provider: azurermProvider,
    });

    awsVpnConnection = new VpnGatewayConnection(
      scope,
      `${props.awsVpnSiteName}-conn`,
      {
        name: `${props.awsVpnSiteName}-conn`,
        vpnGatewayId: vpnGateway.id,
        vpnSiteId: awsVpnSite.id,
        sharedKey: props.awsVpnSiteLinkPresharedKey,
        enableBgp: true,
        // routingWeight 等追加可
        provider: azurermProvider,
      }
    );
  }

  // 4. Google サイト接続 (オプション)
  let googleVpnSite: VpnSite | undefined;
  let googleVpnConnection: VpnGatewayConnection | undefined;
  if (props.googleToAzure) {
    googleVpnSite = new VpnSite(scope, props.googleVpnSiteName, {
      name: props.googleVpnSiteName,
      resourceGroupName: props.resourceGroupName,
      location: props.location,
      virtualWanId: virtualWan.id,
      link: [
        {
          name: props.googleVpnSiteLinkName,
          ipAddress: props.googleVpnSiteLinkIpAddress,
          bgp: {
            asn: props.googleVpnSiteBgpAsn,
            peeringAddress: props.googleVpnSiteLinkBgpAddress,
          },
        },
      ],
      provider: azurermProvider,
    });

    googleVpnConnection = new VpnGatewayConnection(
      scope,
      `${props.googleVpnSiteName}-conn`,
      {
        name: `${props.googleVpnSiteName}-conn`,
        vpnGatewayId: vpnGateway.id,
        vpnSiteId: googleVpnSite.id,
        sharedKey: props.googleVpnSiteLinkPresharedKey,
        enableBgp: true,
        provider: azurermProvider,
      }
    );
  }

  return {
    virtualWan,
    virtualHub,
    vpnGateway,
    awsVpnSite,
    awsVpnConnection,
    googleVpnSite,
    googleVpnConnection,
  };
}
