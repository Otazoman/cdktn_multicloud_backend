import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import {
  awsVpcResourcesparams,
  awsVpnparams,
  createCustomerGatewayParams,
} from "../config/aws/awssettings";
import {
  azureAwsVpnparams,
  azureCommonparams,
  azureGoogleVpnparams,
  azureVnetResourcesparams,
  azureVpnGatewayParams,
  azureVpnparams,
  createLocalGatewayParams,
} from "../config/azure/azuresettings";
import {
  createGoogleVpnPeerParams,
  googleVpcResourcesparams,
  googleVpnParams,
} from "../config/google/googlesettings";
import { createAwsCustomerGateway } from "../constructs/vpnnetwork/awscgw";
import { createAwsVpnGateway } from "../constructs/vpnnetwork/awsvpngw";
import { createVpnConnectionRoutes } from "../constructs/vpnnetwork/awsvpnroute";
import { createAzureLocalGateways } from "../constructs/vpnnetwork/azurelocalgwcon";
import { createAzureVpnGateway } from "../constructs/vpnnetwork/azurevpngw";
import { createGooglePeerTunnel } from "../constructs/vpnnetwork/googletunnels";
import { createGoogleVpnGateway } from "../constructs/vpnnetwork/googlevpngw";

import {
  awsToAzure,
  awsToGoogle,
  env,
  googleToAzure,
} from "../config/commonsettings";
import {
  AwsVpcResources,
  AzureVnetResources,
  GoogleVpcResources,
  TunnelConfig,
  VpnResources,
} from "./interfaces";

const DESTINATION = {
  AWS: "aws",
  AZURE: "azure",
  GOOGLE: "google",
} as const;

function isComputeHaVpnGateway(
  gateway: any
): gateway is { vpnInterfaces: Map<number, { ipAddress: string }> } {
  return gateway && "vpnInterfaces" in gateway;
}

function getVpnGatewayIpAddresses(
  gateway: any,
  isSingleTunnel: boolean
): string[] {
  const ipAddresses: string[] = [];

  if (isSingleTunnel) {
    ipAddresses.push(gateway.externalIp[0].address);
  } else if (isComputeHaVpnGateway(gateway.vpnGateway)) {
    const interfaceCount = 2;
    for (let i = 0; i < interfaceCount; i++) {
      const interfaceObj = gateway.vpnGateway.vpnInterfaces.get(i);
      if (interfaceObj?.ipAddress) {
        ipAddresses.push(interfaceObj.ipAddress);
      }
    }
  } else if (gateway.externalIp) {
    ipAddresses.push(gateway.externalIp[0]?.address);
    ipAddresses.push(gateway.externalIp[1]?.address);
  }

  return ipAddresses;
}

function getCloudRouter(gateway: any, isSingleTunnel: boolean): any {
  if (isSingleTunnel) {
    return null;
  }
  return gateway.cloudRouter || null;
}

function getForwardingRuleResources(
  gateway: any,
  isSingleTunnel: boolean
): any {
  if (isSingleTunnel) {
    return gateway.forwardingRuleResources || null;
  }
  return null;
}

function extractAwsVpnTunnels(
  cgwVpns: any[],
  isSingleTunnel: boolean
): TunnelConfig[] {
  return cgwVpns.flatMap((cgw) => {
    if (!cgw.vpnConnection) return [];

    return [
      {
        address: cgw.vpnConnection.tunnel1Address,
        preshared_key: cgw.vpnConnection.tunnel1PresharedKey,
        apipaCidr: `${cgw.vpnConnection.tunnel1CgwInsideAddress}/30`,
        peerAddress: isSingleTunnel
          ? cgw.vpnConnection.tunnel1Address
          : cgw.vpnConnection.tunnel1VgwInsideAddress,
      },
      {
        address: cgw.vpnConnection.tunnel2Address,
        preshared_key: cgw.vpnConnection.tunnel2PresharedKey,
        apipaCidr: `${cgw.vpnConnection.tunnel2CgwInsideAddress}/30`,
        peerAddress: isSingleTunnel
          ? cgw.vpnConnection.tunnel2Address
          : cgw.vpnConnection.tunnel2VgwInsideAddress,
      },
    ];
  });
}

function createAwsVpnRoutes(
  scope: Construct,
  awsProvider: AwsProvider,
  vpnConnectionId: string,
  target: string,
  cidrBlock: string
): void {
  if (!vpnConnectionId) {
    throw new Error(`VPN Connection ID not found for target: ${target}`);
  }

  createVpnConnectionRoutes(scope, awsProvider, {
    routes: [{ target, cidrBlock }],
    vpnConnectionId,
  });
}

function setupGoogleVpnTunnels(
  scope: Construct,
  googleProvider: GoogleProvider,
  vpnGateway: any,
  cloudRouter: any,
  peerAsn: number,
  destination: string,
  vpnParams: any,
  vpnConnections: TunnelConfig[],
  isSingleTunnel: boolean,
  localCidr: string,
  peerCidr: string,
  vpcName: string,
  forwardingRuleResources: any,
  labels?: { [key: string]: string } | undefined
): any {
  const gatewayConfig = {
    vpnGatewayId: isSingleTunnel
      ? vpnGateway.vpnGateway?.selfLink || vpnGateway.vpnGateway?.id
      : vpnGateway.vpnGateway.id,
    peerAsn,
  };

  const externalVpnGateway = {
    name: `${vpnParams.vpnGatewayName}-${destination}-external-gateway`,
    interfaces: vpnConnections.map((conn) => ({ ipAddress: conn.address })),
  };

  const vpnPeerParams = createGoogleVpnPeerParams(
    destination,
    vpnConnections.length,
    vpnParams.ikeVersion,
    cloudRouter,
    gatewayConfig,
    externalVpnGateway,
    vpnConnections,
    isSingleTunnel,
    localCidr,
    peerCidr,
    vpcName,
    forwardingRuleResources,
    labels
  );

  return createGooglePeerTunnel(scope, googleProvider, {
    ...vpnPeerParams,
    customIpRanges: vpnParams.customIpRanges,
  });
}

function createAzureVpnGatewayConfig(
  azureVnetResources: AzureVnetResources,
  isSingleTunnel: boolean,
  awsToAzure: boolean,
  googleToAzure: boolean
) {
  return {
    resourceGroupName: azureCommonparams.resourceGroup,
    virtualNetworkName: azureVnetResources.vnet.name,
    VpnGatewayName: azureVpnGatewayParams.VpnGatewayName,
    gatewaySubnetCidr: azureVpnparams.gatewaySubnetCidr,
    publicIpNames: azureVpnparams.publicIpNames,
    location: azureCommonparams.location,
    vpnProps: {
      type: azureVpnparams.type,
      vpnType: azureVpnparams.vpnType,
      sku: azureVpnparams.sku,
      azureAsn: azureVpnparams.azureAsn,
      pipAlloc: azureVpnparams.pipAlloc,
      ...(awsToAzure
        ? {
            awsGwIp1ip1: azureAwsVpnparams.awsGwIp1ip1,
            awsGwIp1ip2: azureAwsVpnparams.awsGwIp1ip2,
            awsGwIp2ip1: azureAwsVpnparams.awsGwIp2ip1,
            awsGwIp2ip2: azureAwsVpnparams.awsGwIp2ip2,
          }
        : {}),
      ...(googleToAzure
        ? {
            googleGWip1: azureGoogleVpnparams.googleGwIp1,
            googleGWip2: azureGoogleVpnparams.googleGwIp2,
            googlePeerIp1: azureGoogleVpnparams.googlePeerIp1,
            googlePeerIp2: azureGoogleVpnparams.googlePeerIp2,
          }
        : {}),
    },
    diagnosticSettings: {
      retentionInDays: azureVpnparams.retentionInDays,
    },
    isSingleTunnel,
    awsToAzure,
    awsToGoogle: false,
    googleToAzure,
    tags: azureVpnparams.vpnGwtags,
  };
}

function setupAwsToGoogleVpn(
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider,
  resources: VpnResources,
  googleVpcResources: GoogleVpcResources,
  isSingleTunnel: boolean
): void {
  const googleVpnGatewayIpAddresses = isSingleTunnel
    ? [resources.googleVpnGateways?.externalIp?.[0]?.address ?? ""]
    : ([
        resources.googleVpnGateways.vpnGateway.vpnInterfaces.get(0)?.ipAddress,
        resources.googleVpnGateways.vpnGateway.vpnInterfaces.get(1)?.ipAddress,
      ].filter(Boolean) as string[]);

  // AWS Customer Gateway
  resources.awsGoogleCgwVpns = createAwsCustomerGateway(
    scope,
    awsProvider,
    createCustomerGatewayParams(
      DESTINATION.GOOGLE,
      googleVpnParams.bgpGoogleAsn,
      resources.awsVpnGateway.id,
      googleVpnGatewayIpAddresses,
      isSingleTunnel,
      awsVpnparams.customerGatewayTags
    )
  );

  // Google VPN Tunnels
  resources.awsGoogleVpnTunnels = setupGoogleVpnTunnels(
    scope,
    googleProvider,
    resources.googleVpnGateways,
    getCloudRouter(resources.googleVpnGateways, isSingleTunnel),
    awsVpnparams.bgpAwsAsn,
    DESTINATION.AWS,
    googleVpnParams,
    extractAwsVpnTunnels(resources.awsGoogleCgwVpns, isSingleTunnel),
    isSingleTunnel,
    googleVpcResourcesparams.vpcCidrblock,
    awsVpcResourcesparams.vpcCidrBlock,
    googleVpcResources.vpc.name,
    getForwardingRuleResources(resources.googleVpnGateways, isSingleTunnel),
    googleVpnParams.labels
  );

  // Single tunnel routes - VPC CIDR, CloudSQL range, and Google DNS range
  if (isSingleTunnel && resources.awsGoogleCgwVpns?.[0]?.vpnConnection?.id) {
    // Route to Google VPC CIDR
    createAwsVpnRoutes(
      scope,
      awsProvider,
      resources.awsGoogleCgwVpns[0].vpnConnection.id,
      DESTINATION.GOOGLE,
      googleVpcResourcesparams.vpcCidrblock
    );

    // Route to CloudSQL private service connection range and Google DNS range
    if (
      googleVpnParams.customIpRanges &&
      googleVpnParams.customIpRanges.length > 0
    ) {
      googleVpnParams.customIpRanges.forEach((ipRange) => {
        const routeTarget =
          ipRange === "35.199.192.0/19" ? "google-dns" : "cloudsql";
        createAwsVpnRoutes(
          scope,
          awsProvider,
          resources.awsGoogleCgwVpns![0].vpnConnection.id,
          routeTarget,
          ipRange
        );
      });
    }
  }
}

function setupAwsToAzureVpn(
  scope: Construct,
  awsProvider: AwsProvider,
  azureProvider: AzurermProvider,
  resources: VpnResources,
  azureVnetResources: AzureVnetResources,
  azureVng: any,
  isSingleTunnel: boolean
): void {
  // Create AWS Customer Gateway
  resources.awsAzureCgwVpns = createAwsCustomerGateway(scope, awsProvider, {
    ...createCustomerGatewayParams(
      DESTINATION.AZURE,
      azureVpnparams.azureAsn,
      resources.awsVpnGateway.id,
      azureVng.publicIpData.map((pip: any) => pip.ipAddress),
      isSingleTunnel,
      awsVpnparams.customerGatewayTags
    ),
    azureVpnProps: {
      awsGwIpCidr1: azureAwsVpnparams.awsGwIp1Cidr,
      awsGwIpCidr2: azureAwsVpnparams.awsGwIp2Cidr,
    },
  });

  // Create Azure Local Gateway
  resources.awsAzureLocalGateways = createAzureLocalGateways(
    scope,
    azureProvider,
    createLocalGatewayParams(
      azureVng.virtualNetworkGateway.id,
      DESTINATION.AWS,
      resources.awsAzureCgwVpns
        .flatMap((cgw, index) => {
          if (!cgw.vpnConnection) return [];
          const tunnelIndex = index + 1;

          return [
            {
              localNetworkGatewayName: `${azureVnetResources.vnet.name}-${DESTINATION.AWS}-lng`,
              localGatewayAddress: cgw.vpnConnection.tunnel1Address,
              localAddressSpaces: [awsVpcResourcesparams.vpcCidrBlock],
              sharedKey: cgw.vpnConnection.tunnel1PresharedKey,
              bgpSettings: {
                asn: awsVpnparams.bgpAwsAsn,
                bgpPeeringAddress: (azureAwsVpnparams as any)[
                  `azureAwsGwIp${tunnelIndex}ip1`
                ],
              },
            },
            {
              localNetworkGatewayName: `${azureVnetResources.vnet.name}-${DESTINATION.AWS}-lng`,
              localGatewayAddress: cgw.vpnConnection.tunnel2Address,
              localAddressSpaces: [awsVpcResourcesparams.vpcCidrBlock],
              sharedKey: cgw.vpnConnection.tunnel2PresharedKey,
              bgpSettings: {
                asn: awsVpnparams.bgpAwsAsn,
                bgpPeeringAddress: (azureAwsVpnparams as any)[
                  `azureAwsGwIp${tunnelIndex}ip2`
                ],
              },
            },
          ];
        })
        .filter((tunnel) => tunnel !== null),
      isSingleTunnel,
      awsToAzure,
      awsToGoogle,
      googleToAzure,
      awsVpcResourcesparams.vpcCidrBlock,
      googleVpcResourcesparams.vpcCidrblock,
      azureVpnparams.localGwtags
    )
  );

  // Create routes for single tunnel
  if (isSingleTunnel && resources.awsAzureCgwVpns[0]?.vpnConnection?.id) {
    createAwsVpnRoutes(
      scope,
      awsProvider,
      resources.awsAzureCgwVpns[0].vpnConnection.id,
      DESTINATION.AZURE,
      azureVnetResourcesparams.vnetAddressSpace
    );
  }
}

function setupGoogleToAzureVpn(
  scope: Construct,
  googleProvider: GoogleProvider,
  azureProvider: AzurermProvider,
  resources: VpnResources,
  googleVpcResources: GoogleVpcResources,
  azureVnetResources: AzureVnetResources,
  azureVng: any,
  isSingleTunnel: boolean,
  awsToAzure: boolean,
  awsToGoogle: boolean,
  googleToAzure: boolean
): void {
  // Google VPN Gateway
  const googleVpnGateway = resources.googleVpnGateways;

  if (!googleVpnGateway) {
    throw new Error("Google VPN Gateway not found for Google-Azure VPN setup.");
  }

  // Setup Google VPN Tunnels
  resources.azureGoogleVpnTunnels = setupGoogleVpnTunnels(
    scope,
    googleProvider,
    googleVpnGateway,
    getCloudRouter(googleVpnGateway, isSingleTunnel),
    azureVpnparams.azureAsn,
    DESTINATION.AZURE,
    googleVpnParams,
    azureVng.publicIpData.flatMap((pip: any) =>
      isSingleTunnel
        ? [
            {
              address: pip.ipAddress,
              ipAddress: azureVpnGatewayParams.vpnProps.googlePeerIp1,
              preshared_key: azureGoogleVpnparams.presharedKey,
              peerAddress: azureVng.publicIpData[0].ipAddress,
            },
          ]
        : [
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
          ]
    ),
    isSingleTunnel,
    googleVpcResourcesparams.vpcCidrblock,
    azureVnetResourcesparams.vnetAddressSpace,
    googleVpcResources.vpc.name,
    getForwardingRuleResources(googleVpnGateway, isSingleTunnel),
    googleVpnParams.labels
  );

  const googleLocalAddressSpaces = [googleVpcResourcesparams.vpcCidrblock];
  if (
    isSingleTunnel &&
    googleVpnParams.customIpRanges &&
    googleVpnParams.customIpRanges.length > 0
  ) {
    googleLocalAddressSpaces.push(...googleVpnParams.customIpRanges);
  }

  // Create Azure Local Gateway
  resources.googleAzureLocalGateways = createAzureLocalGateways(
    scope,
    azureProvider,
    createLocalGatewayParams(
      azureVng.virtualNetworkGateway.id,
      DESTINATION.GOOGLE,
      getVpnGatewayIpAddresses(googleVpnGateway, isSingleTunnel).map(
        (address, index) => ({
          localNetworkGatewayName: `${azureVnetResources.vnet.name}-${DESTINATION.GOOGLE}-lng`,
          localGatewayAddress: address,
          localAddressSpaces: googleLocalAddressSpaces,
          sharedKey: azureGoogleVpnparams.presharedKey,
          bgpSettings: {
            asn: googleVpnParams.bgpGoogleAsn,
            bgpPeeringAddress:
              index === 0
                ? azureGoogleVpnparams.googlePeerIp1
                : azureGoogleVpnparams.googlePeerIp2,
          },
        })
      ),
      isSingleTunnel,
      awsToAzure,
      awsToGoogle,
      googleToAzure,
      awsVpcResourcesparams.vpcCidrBlock,
      googleVpcResourcesparams.vpcCidrblock,
      azureVpnparams.localGwtags
    )
  );
}

export function createVpnResources(
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider,
  azureProvider: AzurermProvider,
  awsVpcResources?: AwsVpcResources,
  googleVpcResources?: GoogleVpcResources,
  azureVnetResources?: AzureVnetResources
): VpnResources {
  const resources: VpnResources = {};
  const isSingleTunnel = env === "dev";

  // Create AWS VPN Gateway
  if ((awsToGoogle || awsToAzure) && awsVpcResources) {
    resources.awsVpnGateway = createAwsVpnGateway(scope, awsProvider, {
      vpcId: awsVpcResources.vpc.id,
      amazonSideAsn: awsVpnparams.bgpAwsAsn,
      vgwName: `${awsVpcResourcesparams.vpcName}-vgw`,
      routeTableIds: [
        awsVpcResources.publicRouteTable.id,
        awsVpcResources.privateRouteTable.id,
      ],
      tags: awsVpnparams.vpnGatewayTags,
    });
  }

  // Create Google VPN Gateway (Single Tunnel and HA VPN)
  if (
    (awsToGoogle || googleToAzure) &&
    googleVpcResources &&
    !resources.googleVpnGateway
  ) {
    // Determine if custom IP ranges should be passed (only for HA VPN and when customIpRanges is set)
    const shouldUseCustomIpRanges =
      !isSingleTunnel &&
      googleVpnParams.customIpRanges &&
      googleVpnParams.customIpRanges.length > 0;

    resources.googleVpnGateways = createGoogleVpnGateway(
      scope,
      googleProvider,
      {
        vpcNetwork: googleVpcResources.vpc.name,
        connectDestination: googleVpnParams.connectDestination,
        vpnGatewayName: googleVpnParams.vpnGatewayName,
        cloudRouterName: googleVpnParams.cloudRouterName,
        bgpGoogleAsn: googleVpnParams.bgpGoogleAsn,
        isSingleTunnel,
        ...(shouldUseCustomIpRanges && {
          customIpRanges: googleVpnParams.customIpRanges,
        }),
        labels: googleVpnParams.labels,
      }
    );
  }

  // Create Azure VPN Gateway
  if ((awsToAzure || googleToAzure) && azureVnetResources) {
    resources.azureVng = createAzureVpnGateway(
      scope,
      azureProvider,
      createAzureVpnGatewayConfig(
        azureVnetResources,
        isSingleTunnel,
        awsToAzure,
        googleToAzure
      )
    );
  }

  // Setup AWS-Google VPN
  const isGoogleToAzureHaEnabled =
    awsToAzure && googleToAzure && !isSingleTunnel && googleVpcResources;
  if (isGoogleToAzureHaEnabled || (awsToGoogle && googleVpcResources)) {
    setupAwsToGoogleVpn(
      scope,
      awsProvider,
      googleProvider,
      resources,
      googleVpcResources,
      isSingleTunnel
    );
  }

  // Setup AWS-Azure VPN
  if (awsToAzure && awsVpcResources && azureVnetResources) {
    setupAwsToAzureVpn(
      scope,
      awsProvider,
      azureProvider,
      resources,
      azureVnetResources,
      resources.azureVng,
      isSingleTunnel
    );
  }

  // Setup Google-Azure VPN
  if (googleToAzure && googleVpcResources && azureVnetResources) {
    setupGoogleToAzureVpn(
      scope,
      googleProvider,
      azureProvider,
      resources,
      googleVpcResources,
      azureVnetResources,
      resources.azureVng,
      isSingleTunnel,
      awsToAzure,
      awsToGoogle,
      googleToAzure
    );
  }

  return resources;
}
