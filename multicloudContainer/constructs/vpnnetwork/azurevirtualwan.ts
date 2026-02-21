import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { VirtualHub } from "@cdktn/provider-azurerm/lib/virtual-hub";
import { VirtualWan } from "@cdktn/provider-azurerm/lib/virtual-wan";
import { VpnGateway } from "@cdktn/provider-azurerm/lib/vpn-gateway";
import { VpnGatewayConnection } from "@cdktn/provider-azurerm/lib/vpn-gateway-connection";
import { VpnSite } from "@cdktn/provider-azurerm/lib/vpn-site";
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
  // Virtual WAN & Hub
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

  // vpn gateway
  const vpnGateway = new VpnGateway(scope, props.virtualHubVpnGatewayName, {
    provider: azurermProvider,
    name: props.virtualHubVpnGatewayName,
    resourceGroupName: props.resourceGroupName,
    location: props.location,
    virtualHubId: virtualHub.id,
    scaleUnit: props.scaleUnit,
  });

  // aws site
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
        remoteVpnSiteId: awsVpnSite.id,
        vpnLink: [
          {
            name: `${props.awsVpnSiteName}-link`,
            vpnSiteLinkId: awsVpnSite.link.get(0).id,
            sharedKey: props.awsVpnSiteLinkPresharedKey,
          },
        ],
        provider: azurermProvider,
      }
    );
  }

  // Google Site
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
        remoteVpnSiteId: googleVpnSite.id,
        vpnLink: [
          {
            name: `${props.googleVpnSiteName}-link`,
            vpnSiteLinkId: googleVpnSite.link.get(0).id,
            sharedKey: props.googleVpnSiteLinkPresharedKey,
          },
        ],
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
