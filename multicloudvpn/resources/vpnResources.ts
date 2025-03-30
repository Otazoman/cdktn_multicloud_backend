import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
import { Construct } from "constructs";
import {
  awsVpcResourcesparams,
  awsVpnparams,
  createCustomerGatewayParams,
} from "../config/awssettings";
import {
  azureAwsVpnparams,
  azureCommonparams,
  azureGoogleVpnparams,
  azureVnetResourcesparams,
  azureVpnGatewayParams,
  azureVpnparams,
  createLocalGatewayParams,
} from "../config/azuresettings";
import {
  awsToAzure,
  awsToGoogle,
  env,
  googleToAzure,
} from "../config/commonsettings";
import {
  createGoogleVpnPeerParams,
  googleAwsVpnParams,
  googleAzureVpnParams,
  googleVpcResourcesparams,
} from "../config/googlesettings";
import { createAwsCustomerGateway } from "../constructs/vpnnetwork/awscgw";
import { createAwsVpnGateway } from "../constructs/vpnnetwork/awsvpngw";
import { createVpnConnectionRoutes } from "../constructs/vpnnetwork/awsvpnroute";
import { createAzureLocalGateways } from "../constructs/vpnnetwork/azurelocalgwcon";
import { createAzureVpnGateway } from "../constructs/vpnnetwork/azurevpngw";
import { createGooglePeerTunnel } from "../constructs/vpnnetwork/googletunnels";
import { createGoogleVpnGateway } from "../constructs/vpnnetwork/googlevpngw";

interface RouteConfig {
  target: string;
  cidrBlock: string;
}

interface VpnResources {
  awsVpnGateway: any;
  googleVpnGateways: any;
  awsGoogleCgwVpns: any;
  awsGoogleVpnTunnels: any;
  azureVng: any;
  awsAzureCgwVpns: any;
  awsAzureLocalGateways: any;
  googleAzureVpnGateways: any;
  azureGoogleVpnTunnels: any;
  googleAzureLocalGateways: any;
}

function isComputeHaVpnGateway(
  gateway: any
): gateway is { vpnInterfaces: Map<number, { ipAddress: string }> } {
  return "vpnInterfaces" in gateway;
}

export function createVpnResources(
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider,
  azureProvider: AzurermProvider,
  awsVpcResources: any,
  googleVpcResources: any,
  azureVnetResources: any
): VpnResources {
  const resources: VpnResources = {
    awsVpnGateway: undefined,
    googleVpnGateways: undefined,
    awsGoogleCgwVpns: undefined,
    awsGoogleVpnTunnels: undefined,
    azureVng: undefined,
    awsAzureCgwVpns: undefined,
    awsAzureLocalGateways: undefined,
    googleAzureVpnGateways: undefined,
    azureGoogleVpnTunnels: undefined,
    googleAzureLocalGateways: undefined,
  };

  const destinationAws = "aws";
  const destinationAzure = "azure";
  const destinationGoogle = "google";
  const isSingleTunnel = env === "dev";

  if (awsToGoogle || awsToAzure) {
    // AWS VPN Gateway
    const awsVpnGatewayResourceparams = {
      vpcId: awsVpcResources.vpc.id,
      routeTableId: awsVpcResources.vpc.defaultRouteTableId,
      amazonSideAsn: awsVpnparams.bgpAwsAsn,
      vgwName: `${awsVpcResourcesparams.vpcName}-vgw`,
    };
    resources.awsVpnGateway = createAwsVpnGateway(
      scope,
      awsProvider,
      awsVpnGatewayResourceparams
    );
  }

  if (awsToGoogle) {
    // Google VPN Gateway (Connect AWS)
    const GoogleVpnParams = {
      vpcNetwork: googleVpcResources.vpc.name,
      connectDestination: googleAwsVpnParams.connectDestination,
      vpnGatewayName: googleAwsVpnParams.vpnGatewayName,
      cloudRouterName: googleAwsVpnParams.cloudRouterName,
      bgpGoogleAsn: googleAwsVpnParams.bgpGoogleAsn,
      isSingleTunnel: isSingleTunnel,
    };
    resources.googleVpnGateways = createGoogleVpnGateway(
      scope,
      googleProvider,
      GoogleVpnParams
    );

    // Obtain IP address of VPNGW in Google (Connect AWS)
    const awsGoogleVpnGatewayIpAddresses: string[] = [];
    if (isSingleTunnel) {
      // Single
      const externalIp = resources.googleVpnGateways.externalIp[0].address;
      awsGoogleVpnGatewayIpAddresses.push(externalIp);
    } else {
      // HA
      const awsinterfaceCount = 2;
      for (let index = 0; index < awsinterfaceCount; index++) {
        const interfaceObj =
          resources.googleVpnGateways.vpnGateway.vpnInterfaces.get(index);
        if (interfaceObj) {
          awsGoogleVpnGatewayIpAddresses.push(interfaceObj.ipAddress);
        }
      }

      // AWS CustomerGateway (Connect Google)
      const awsGoogleCustomerGatewayParams = createCustomerGatewayParams(
        destinationGoogle,
        googleAwsVpnParams.bgpGoogleAsn,
        resources.awsVpnGateway.id,
        awsGoogleVpnGatewayIpAddresses,
        isSingleTunnel
      );
      const awsGoogleCgwVpns = createAwsCustomerGateway(
        scope,
        awsProvider,
        awsGoogleCustomerGatewayParams
      );

      const awsVpnConnections = awsGoogleCgwVpns.flatMap((cgw) => {
        if (!cgw.vpnConnection) return [];
        const vpnConnection = cgw.vpnConnection;
        return [
          {
            address: vpnConnection.tunnel1Address,
            preshared_key: vpnConnection.tunnel1PresharedKey,
            apipaCidr: `${vpnConnection.tunnel1CgwInsideAddress}/30`,
            peerAddress: isSingleTunnel
              ? vpnConnection.tunnel1Address
              : vpnConnection.tunnel1VgwInsideAddress,
          },
          {
            address: vpnConnection.tunnel2Address,
            preshared_key: vpnConnection.tunnel2PresharedKey,
            apipaCidr: `${vpnConnection.tunnel2CgwInsideAddress}/30`,
            peerAddress: isSingleTunnel
              ? vpnConnection.tunnel2Address
              : vpnConnection.tunnel2VgwInsideAddress,
          },
        ];
      });

      // Google VPN tunnels and peers (AWS)
      const awsGoogleVpnGateway = {
        vpnGatewayId: resources.googleVpnGateways.vpnGateway.id,
        peerAsn: awsVpnparams.bgpAwsAsn,
      };
      const awsExternalVpnGateway = {
        name: googleAwsVpnParams.vpnGatewayName,
        interfaces: awsGoogleCgwVpns.flatMap((cgw) =>
          cgw.vpnConnection
            ? [
                { ipAddress: cgw.vpnConnection.tunnel1Address },
                { ipAddress: cgw.vpnConnection.tunnel2Address },
              ]
            : []
        ),
      };
      const awsGoogleVpnParams = createGoogleVpnPeerParams(
        destinationAws,
        awsGoogleCgwVpns.length * 2,
        googleAwsVpnParams.ikeVersion,
        googleAwsVpnParams.cloudRouterName,
        awsGoogleVpnGateway,
        awsExternalVpnGateway,
        awsVpnConnections,
        isSingleTunnel,
        googleVpcResourcesparams.vpcCidrblock,
        awsVpcResourcesparams.vpcCidrBlock,
        googleVpcResources.vpc.name,
        resources.googleVpnGateways.forwardingRuleResources
      );
      createGooglePeerTunnel(scope, googleProvider, awsGoogleVpnParams);

      // AWS VPN Connection Routes for Google (Single Tunnel Only)
      if (isSingleTunnel) {
        const awsGoogleVpnConnectionRoutes: RouteConfig[] = [
          {
            target: destinationGoogle,
            cidrBlock: googleVpcResourcesparams.vpcCidrblock,
          },
        ];

        const vpnConnectionId = awsGoogleCgwVpns[0]?.vpnConnection?.id;
        if (!vpnConnectionId) {
          throw new Error(
            "VPN Connection ID not found in AWS Customer Gateway."
          );
        }

        createVpnConnectionRoutes(scope, awsProvider, {
          routes: awsGoogleVpnConnectionRoutes,
          vpnConnectionId: vpnConnectionId,
        });
      }
    }
  }

  if (awsToAzure || googleToAzure) {
    // Azure VPN Gateway
    const vpnProps: any = {
      type: azureVpnparams.type,
      vpnType: azureVpnparams.vpnType,
      sku: azureVpnparams.sku,
      azureAsn: azureVpnparams.azureAsn,
      pipAlloc: azureVpnparams.pipAlloc,
    };

    if (awsToAzure) {
      // AWS
      vpnProps.awsGwIp1ip1 = azureAwsVpnparams.awsGwIp1ip1;
      vpnProps.awsGwIp1ip2 = azureAwsVpnparams.awsGwIp1ip2;
      vpnProps.awsGwIp2ip1 = azureAwsVpnparams.awsGwIp2ip1;
      vpnProps.awsGwIp2ip2 = azureAwsVpnparams.awsGwIp2ip2;
    }

    if (googleToAzure) {
      // Google
      vpnProps.googleGWip1 = azureGoogleVpnparams.googleGwIp1;
      vpnProps.googleGWip2 = azureGoogleVpnparams.googleGwIp2;
      vpnProps.googlePeerIp1 = azureGoogleVpnparams.googlePeerIp1;
      vpnProps.googlePeerIp2 = azureGoogleVpnparams.googlePeerIp2;
    }

    const azureVpnGatewayResourceparams = {
      resourceGroupName: azureCommonparams.resourceGroup,
      virtualNetworkName: azureVnetResources.vnet.name,
      VpnGatewayName: azureVpnGatewayParams.VpnGatewayName,
      gatewaySubnetCidr: azureVpnparams.gatewaySubnetCidr,
      publicIpNames: azureVpnparams.publicIpNames,
      location: azureCommonparams.location,
      vpnProps: vpnProps,
      diagnosticSettings: {
        retentionInDays: azureVpnparams.retentionInDays,
      },
      isSingleTunnel: isSingleTunnel,
    };

    const azureVng = createAzureVpnGateway(
      scope,
      azureProvider,
      azureVpnGatewayResourceparams
    );

    const azurePublicIpAddresses = azureVng.publicIpData.map(
      (pip) => pip.ipAddress
    );

    if (awsToAzure) {
      // AWS CustomerGateway (Connect Azure)
      const azureCgwParams = createCustomerGatewayParams(
        destinationAzure,
        azureVpnparams.azureAsn,
        resources.awsVpnGateway.id,
        azurePublicIpAddresses,
        isSingleTunnel
      );
      const azureCustomerGatewayParams = {
        ...azureCgwParams,
        azureVpnProps: {
          awsGwIpCidr1: azureAwsVpnparams.awsGwIp1Cidr,
          awsGwIpCidr2: azureAwsVpnparams.awsGwIp2Cidr,
        },
      };
      const awsAzureCgwVpns = createAwsCustomerGateway(
        scope,
        awsProvider,
        azureCustomerGatewayParams
      );

      // Create Azure Local Gateway (AWS)
      const awsAzureVpnTunnels = awsAzureCgwVpns
        .flatMap((cgw, index) => {
          if (!cgw.vpnConnection) return [];
          const tunnelIndex = index + 1;
          return [
            {
              address: cgw.vpnConnection.tunnel1Address,
              shared_key: cgw.vpnConnection.tunnel1PresharedKey,
              cidrhost: (azureAwsVpnparams as any)[
                `azureAwsGwIp${tunnelIndex}ip1`
              ],
            },
            {
              address: cgw.vpnConnection.tunnel2Address,
              shared_key: cgw.vpnConnection.tunnel2PresharedKey,
              cidrhost: (azureAwsVpnparams as any)[
                `azureAwsGwIp${tunnelIndex}ip2`
              ],
            },
          ];
        })
        .filter((tunnel) => tunnel !== null);

      const awsTunnels = awsAzureVpnTunnels.map((tunnel, _index) => ({
        localNetworkGatewayName: `${azureVnetResources.vnet.name}-${destinationAws}-lng`,
        localGatewayAddress: tunnel.address,
        localAddressSpaces: [awsVpcResourcesparams.vpcCidrBlock],
        sharedKey: tunnel.shared_key,
        bgpSettings: {
          asn: awsVpnparams.bgpAwsAsn,
          bgpPeeringAddress: tunnel.cidrhost,
        },
      }));

      const awsAzureLocalGatewayParams = createLocalGatewayParams(
        azureVng.virtualNetworkGateway.id,
        destinationAws,
        awsTunnels,
        isSingleTunnel
      );
      resources.awsAzureLocalGateways = createAzureLocalGateways(
        scope,
        azureProvider,
        awsAzureLocalGatewayParams
      );

      // AWS VPN Connection Routes for Azure (Single Tunnel Only)
      if (isSingleTunnel) {
        const awsAzureVpnConnectionRoutes: RouteConfig[] = [
          {
            target: destinationAzure,
            cidrBlock: azureVnetResourcesparams.vnetAddressSpace,
          },
        ];

        const vpnConnectionId = awsAzureCgwVpns[0]?.vpnConnection?.id;
        if (!vpnConnectionId) {
          throw new Error(
            "VPN Connection ID not found in AWS Customer Gateway."
          );
        }

        createVpnConnectionRoutes(scope, awsProvider, {
          routes: awsAzureVpnConnectionRoutes,
          vpnConnectionId: vpnConnectionId,
        });
      }
    }

    if (googleToAzure) {
      const GoogleAzureVpnParams = {
        vpcNetwork: googleVpcResources.vpc.name,
        connectDestination: googleAzureVpnParams.connectDestination,
        vpnGatewayName: googleAzureVpnParams.vpnGatewayName,
        cloudRouterName: googleAzureVpnParams.cloudRouterName,
        bgpGoogleAsn: googleAzureVpnParams.bgpGoogleAsn,
        isSingleTunnel: isSingleTunnel,
      };
      resources.googleAzureVpnGateways = createGoogleVpnGateway(
        scope,
        googleProvider,
        GoogleAzureVpnParams
      );

      // Obtain IP address of VPNGW in Google (Azure)
      const azureGoogleVpnGatewayIpAddresses: string[] = [];
      if (isSingleTunnel) {
        // Single
        const externalIp =
          resources.googleAzureVpnGateways.externalIp[0].address;
        azureGoogleVpnGatewayIpAddresses.push(externalIp);
      } else {
        // HA
        const awsinterfaceCount = 2;
        for (let index = 0; index < awsinterfaceCount; index++) {
          const interfaceObj =
            resources.googleAzureVpnGateways.externalIp[index];
          if (interfaceObj) {
            azureGoogleVpnGatewayIpAddresses.push(interfaceObj.address);
          }
        }
      }

      // Google VPN Gateway (Connect Azure)
      const azureVpnConnections = azureVng.publicIpData.flatMap((pip) => {
        if (isSingleTunnel) {
          // Single tunnel
          return [
            {
              address: pip.ipAddress,
              ipAddress: azureVpnGatewayParams.vpnProps.googlePeerIp1,
              preshared_key: azureGoogleVpnparams.presharedKey,
              peerAddress: azurePublicIpAddresses[0],
            },
          ];
        } else {
          // HA (High Availability)
          return [
            {
              address: pip.ipAddress,
              ipAddress: azureVpnGatewayParams.vpnProps.googlePeerIp1,
              preshared_key: azureGoogleVpnparams.presharedKey,
              peerAddress: azureVpnGatewayParams.vpnProps.googleGWip1,
            },
            {
              address: pip.ipAddress,
              ipAddress: azureVpnGatewayParams.vpnProps.googlePeerIp2,
              preshared_key: azureGoogleVpnparams.presharedKey,
              peerAddress: azureVpnGatewayParams.vpnProps.googleGWip2,
            },
          ];
        }
      });

      // Google VPN tunnels and peers (Azure)
      const azureTunnelcount = isSingleTunnel ? 1 : 2;
      const azureGoogleVpnGateway = {
        vpnGatewayId: resources.googleAzureVpnGateways.vpnGateway.id,
        peerAsn: azureVpnparams.azureAsn,
      };
      const azureExternalVpnGateway = {
        name: googleAzureVpnParams.vpnGatewayName,
        interfaces: azureVng.publicIpData.map((pip) => ({
          ipAddress: pip.ipAddress,
        })),
      };
      const azureGoogleVpnParams = createGoogleVpnPeerParams(
        destinationAzure,
        azureTunnelcount,
        googleAzureVpnParams.ikeVersion,
        googleAzureVpnParams.cloudRouterName,
        azureGoogleVpnGateway,
        azureExternalVpnGateway,
        azureVpnConnections,
        isSingleTunnel,
        googleVpcResourcesparams.vpcCidrblock,
        azureVnetResourcesparams.vnetAddressSpace,
        googleVpcResources.vpc.name,
        resources.googleAzureVpnGateways.forwardingRuleResources
      );
      resources.azureGoogleVpnTunnels = createGooglePeerTunnel(
        scope,
        googleProvider,
        azureGoogleVpnParams
      );

      // Azure localGateway and tunnels (Connect Google)
      const googleAzureVpnTunnels = [];

      if (isSingleTunnel) {
        // Single
        const externalIp =
          resources.googleAzureVpnGateways.externalIp[0].address;
        googleAzureVpnTunnels.push({
          address: externalIp,
          shared_key: azureGoogleVpnparams.presharedKey,
          cidrhost: azureGoogleVpnparams.googlePeerIp1,
        });
      } else {
        // HA
        if (
          isComputeHaVpnGateway(resources.googleAzureVpnGateways.vpnGateway)
        ) {
          const vpninterfacesCount = 2;
          for (let index = 0; index < vpninterfacesCount; index++) {
            const interfaceObj =
              resources.googleAzureVpnGateways.vpnGateway.vpnInterfaces.get(
                index
              );
            if (interfaceObj && interfaceObj.ipAddress) {
              googleAzureVpnTunnels.push({
                address: interfaceObj.ipAddress,
                shared_key: azureGoogleVpnparams.presharedKey,
                cidrhost:
                  index === 0
                    ? azureGoogleVpnparams.googlePeerIp1
                    : azureGoogleVpnparams.googlePeerIp2,
              });
            }
          }
        }
      }

      // Create Azure Local Gateway (Google)
      const googleTunnels = googleAzureVpnTunnels.map((tunnel, _index) => ({
        localNetworkGatewayName: `${azureVnetResources.vnet.name}-${destinationGoogle}-lng`,
        localGatewayAddress: tunnel.address,
        localAddressSpaces: [googleVpcResourcesparams.vpcCidrblock],
        sharedKey: tunnel.shared_key,
        bgpSettings: {
          asn: googleAzureVpnParams.bgpGoogleAsn,
          bgpPeeringAddress: tunnel.cidrhost,
        },
      }));
      const googleAzureLocalGatewayParams = createLocalGatewayParams(
        azureVng.virtualNetworkGateway.id,
        destinationGoogle,
        googleTunnels,
        isSingleTunnel
      );
      resources.googleAzureLocalGateways = createAzureLocalGateways(
        scope,
        azureProvider,
        googleAzureLocalGatewayParams
      );
    }
  }
  return resources;
}
