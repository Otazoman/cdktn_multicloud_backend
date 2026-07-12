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

/**
 * ---------------------------------------------------------------------------
 * How to add a new cloud provider
 * ---------------------------------------------------------------------------
 * This module wires up VPN connectivity between pairs of clouds (AWS, Google,
 * Azure today). VPN peering is inherently pairwise - each pair of clouds has
 * its own connection logic - so adding a new cloud "NewCloud" means adding
 * one connection per existing cloud it should peer with (NewCloud<->AWS,
 * NewCloud<->Google, NewCloud<->Azure, ...). There is no way around writing
 * that pairwise logic, but this file is structured to make each addition as
 * small and mechanical as possible:
 *
 *   1. If NewCloud needs a long-lived "hub" gateway resource (like the AWS
 *      VGW, Google VPN Gateway, or Azure VNG below), add one entry to the
 *      `hubGatewaySteps` array inside createVpnResources().
 *   2. For each existing cloud NewCloud should connect to, write a
 *      `setup<Cloud>To<NewCloud>Vpn(...)` function, following the existing
 *      `setupAwsToGoogleVpn` / `setupAwsToAzureVpn` / `setupGoogleToAzureVpn`
 *      functions as templates. Reuse the shared helpers below
 *      (getCloudRouter, getForwardingRuleResources, getVpnGatewayIpAddresses,
 *      extractAwsVpnTunnels, setupGoogleVpnTunnels) wherever the new cloud's
 *      SDK shape matches - most of the AWS- and Google-side plumbing is
 *      already generic.
 *   3. Register the new function as one entry in the `pairwiseConnectionSteps`
 *      array inside createVpnResources(), with its own enable condition.
 *
 * Nothing outside `hubGatewaySteps` / `pairwiseConnectionSteps` should need to
 * change to add a new pair.
 * ---------------------------------------------------------------------------
 */

const DESTINATION = {
  AWS: "aws",
  AZURE: "azure",
  GOOGLE: "google",
} as const;

// Google Cloud's public DNS address range. Only used to decide the route
// target label for entries in customIpRanges.
const GOOGLE_DNS_RANGE = "35.199.192.0/19";

// AWS VPN connections always have exactly 2 tunnels (tunnel1 / tunnel2), so
// this fixed pair of indexes is used to iterate over them instead of
// duplicating the same block twice.
const AWS_TUNNEL_INDEXES = [1, 2] as const;

// ---------------------------------------------------------------------------
// Gateway-shape helpers
//
// A cloud's VPN gateway resource can look different depending on whether
// it's a single-tunnel (dev) or HA (prod) setup. These helpers normalize
// that difference so the rest of the file doesn't need to branch on it.
// ---------------------------------------------------------------------------

function isComputeHaVpnGateway(
  gateway: any,
): gateway is { vpnInterfaces: Map<number, { ipAddress: string }> } {
  return gateway && "vpnInterfaces" in gateway;
}

function getVpnGatewayIpAddresses(
  gateway: any,
  isSingleTunnel: boolean,
): string[] {
  if (isSingleTunnel) {
    return [gateway.externalIp[0].address];
  }

  if (isComputeHaVpnGateway(gateway.vpnGateway)) {
    return AWS_TUNNEL_INDEXES.map(
      (_, i) => gateway.vpnGateway.vpnInterfaces.get(i)?.ipAddress,
    ).filter((ipAddress): ipAddress is string => Boolean(ipAddress));
  }

  if (gateway.externalIp) {
    return [gateway.externalIp[0]?.address, gateway.externalIp[1]?.address];
  }

  return [];
}

function getCloudRouter(gateway: any, isSingleTunnel: boolean): any {
  return isSingleTunnel ? null : gateway.cloudRouter || null;
}

function getForwardingRuleResources(
  gateway: any,
  isSingleTunnel: boolean,
): any {
  return isSingleTunnel ? gateway.forwardingRuleResources || null : null;
}

// ---------------------------------------------------------------------------
// AWS VPN tunnel extraction
// ---------------------------------------------------------------------------

function extractAwsVpnTunnels(
  cgwVpns: any[],
  isSingleTunnel: boolean,
): TunnelConfig[] {
  return cgwVpns.flatMap((cgw) => {
    const conn = cgw.vpnConnection;
    if (!conn) return [];

    return AWS_TUNNEL_INDEXES.map((n) => ({
      address: conn[`tunnel${n}Address`],
      preshared_key: conn[`tunnel${n}PresharedKey`],
      apipaCidr: `${conn[`tunnel${n}CgwInsideAddress`]}/30`,
      peerAddress: isSingleTunnel
        ? conn[`tunnel${n}Address`]
        : conn[`tunnel${n}VgwInsideAddress`],
    }));
  });
}

function createAwsVpnRoutes(
  scope: Construct,
  awsProvider: AwsProvider,
  vpnConnectionId: string,
  target: string,
  cidrBlock: string,
): void {
  if (!vpnConnectionId) {
    throw new Error(`VPN Connection ID not found for target: ${target}`);
  }

  createVpnConnectionRoutes(scope, awsProvider, {
    routes: [{ target, cidrBlock }],
    vpnConnectionId,
  });
}

// ---------------------------------------------------------------------------
// Google VPN tunnel setup
//
// Shared by every "Google <-> X" connection (currently AWS and Azure). New
// "Google <-> NewCloud" connections should be able to call this directly.
// Parameters are grouped into an options object because this function is
// only used inside this module, so changing its signature has no external
// callers to worry about.
// ---------------------------------------------------------------------------

interface SetupGoogleVpnTunnelsParams {
  vpnGateway: any;
  cloudRouter: any;
  peerAsn: number;
  destination: string;
  vpnParams: any;
  vpnConnections: TunnelConfig[];
  isSingleTunnel: boolean;
  localCidr: string;
  peerCidr: string;
  vpcName: string;
  forwardingRuleResources: any;
  labels?: { [key: string]: string };
}

function setupGoogleVpnTunnels(
  scope: Construct,
  googleProvider: GoogleProvider,
  {
    vpnGateway,
    cloudRouter,
    peerAsn,
    destination,
    vpnParams,
    vpnConnections,
    isSingleTunnel,
    localCidr,
    peerCidr,
    vpcName,
    forwardingRuleResources,
    labels,
  }: SetupGoogleVpnTunnelsParams,
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
    labels,
  );

  return createGooglePeerTunnel(scope, googleProvider, {
    ...vpnPeerParams,
    customIpRanges: vpnParams.customIpRanges,
  });
}

// ---------------------------------------------------------------------------
// Azure VPN Gateway config
// ---------------------------------------------------------------------------

function createAzureVpnGatewayConfig(
  azureVnetResources: AzureVnetResources,
  isSingleTunnel: boolean,
  awsToAzure: boolean,
  googleToAzure: boolean,
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
    publicIpZones: azureVpnparams.publicIpZones,
    tags: azureVpnparams.vpnGwtags,
  };
}

// ---------------------------------------------------------------------------
// AWS <-> Google VPN
// ---------------------------------------------------------------------------

function setupAwsToGoogleVpn(
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider,
  resources: VpnResources,
  googleVpcResources: GoogleVpcResources,
  isSingleTunnel: boolean,
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
      awsVpnparams.customerGatewayTags,
    ),
  );

  // Google VPN Tunnels
  resources.awsGoogleVpnTunnels = setupGoogleVpnTunnels(scope, googleProvider, {
    vpnGateway: resources.googleVpnGateways,
    cloudRouter: getCloudRouter(resources.googleVpnGateways, isSingleTunnel),
    peerAsn: awsVpnparams.bgpAwsAsn,
    destination: DESTINATION.AWS,
    vpnParams: googleVpnParams,
    vpnConnections: extractAwsVpnTunnels(
      resources.awsGoogleCgwVpns,
      isSingleTunnel,
    ),
    isSingleTunnel,
    localCidr: googleVpcResourcesparams.vpcCidrblock,
    peerCidr: awsVpcResourcesparams.vpcCidrBlock,
    vpcName: googleVpcResources.vpc.name,
    forwardingRuleResources: getForwardingRuleResources(
      resources.googleVpnGateways,
      isSingleTunnel,
    ),
    labels: googleVpnParams.labels,
  });

  // Single tunnel routes - VPC CIDR, CloudSQL range, and Google DNS range
  if (isSingleTunnel && resources.awsGoogleCgwVpns?.[0]?.vpnConnection?.id) {
    const vpnConnectionId = resources.awsGoogleCgwVpns[0].vpnConnection.id;

    // Route to Google VPC CIDR
    createAwsVpnRoutes(
      scope,
      awsProvider,
      vpnConnectionId,
      DESTINATION.GOOGLE,
      googleVpcResourcesparams.vpcCidrblock,
    );

    // Route to CloudSQL private service connection range and Google DNS range
    if (
      googleVpnParams.customIpRanges &&
      googleVpnParams.customIpRanges.length > 0
    ) {
      googleVpnParams.customIpRanges.forEach((ipRange) => {
        const routeTarget =
          ipRange === GOOGLE_DNS_RANGE ? "google-dns" : "cloudsql";
        createAwsVpnRoutes(
          scope,
          awsProvider,
          vpnConnectionId,
          routeTarget,
          ipRange,
        );
      });
    }
  }
}

// ---------------------------------------------------------------------------
// AWS <-> Azure VPN
// ---------------------------------------------------------------------------

function setupAwsToAzureVpn(
  scope: Construct,
  awsProvider: AwsProvider,
  azureProvider: AzurermProvider,
  resources: VpnResources,
  azureVnetResources: AzureVnetResources,
  azureVng: any,
  isSingleTunnel: boolean,
): void {
  // Create AWS Customer Gateway
  resources.awsAzureCgwVpns = createAwsCustomerGateway(scope, awsProvider, {
    ...createCustomerGatewayParams(
      DESTINATION.AZURE,
      azureVpnparams.azureAsn,
      resources.awsVpnGateway.id,
      azureVng.publicIpData.map((pip: any) => pip.ipAddress),
      isSingleTunnel,
      awsVpnparams.customerGatewayTags,
    ),
    azureVpnProps: {
      awsGwIpCidr1: azureAwsVpnparams.awsGwIp1Cidr,
      awsGwIpCidr2: azureAwsVpnparams.awsGwIp2Cidr,
    },
  });

  // Create Azure Local Gateway
  const localNetworkGatewayName = `${azureVnetResources.vnet.name}-${DESTINATION.AWS}-lng`;

  resources.awsAzureLocalGateways = createAzureLocalGateways(
    scope,
    azureProvider,
    createLocalGatewayParams(
      azureVng.virtualNetworkGateway.id,
      DESTINATION.AWS,
      resources.awsAzureCgwVpns.flatMap((cgw, index) => {
        const conn = cgw.vpnConnection;
        if (!conn) return [];

        const tunnelIndex = index + 1;

        return AWS_TUNNEL_INDEXES.map((n) => ({
          localNetworkGatewayName,
          localGatewayAddress: conn[`tunnel${n}Address`],
          localAddressSpaces: [awsVpcResourcesparams.vpcCidrBlock],
          sharedKey: conn[`tunnel${n}PresharedKey`],
          bgpSettings: {
            asn: awsVpnparams.bgpAwsAsn,
            bgpPeeringAddress: (azureAwsVpnparams as any)[
              `azureAwsGwIp${tunnelIndex}ip${n}`
            ],
          },
        }));
      }),
      isSingleTunnel,
      awsToAzure,
      awsToGoogle,
      googleToAzure,
      awsVpcResourcesparams.vpcCidrBlock,
      googleVpcResourcesparams.vpcCidrblock,
      azureVpnparams.localGwtags,
    ),
  );

  // Create routes for single tunnel
  if (isSingleTunnel && resources.awsAzureCgwVpns[0]?.vpnConnection?.id) {
    createAwsVpnRoutes(
      scope,
      awsProvider,
      resources.awsAzureCgwVpns[0].vpnConnection.id,
      DESTINATION.AZURE,
      azureVnetResourcesparams.vnetAddressSpace,
    );
  }
}

// ---------------------------------------------------------------------------
// Google <-> Azure VPN
// ---------------------------------------------------------------------------

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
  googleToAzure: boolean,
): void {
  const googleVpnGateway = resources.googleVpnGateways;

  if (!googleVpnGateway) {
    throw new Error("Google VPN Gateway not found for Google-Azure VPN setup.");
  }

  // Setup Google VPN Tunnels
  resources.azureGoogleVpnTunnels = setupGoogleVpnTunnels(
    scope,
    googleProvider,
    {
      vpnGateway: googleVpnGateway,
      cloudRouter: getCloudRouter(googleVpnGateway, isSingleTunnel),
      peerAsn: azureVpnparams.azureAsn,
      destination: DESTINATION.AZURE,
      vpnParams: googleVpnParams,
      vpnConnections: azureVng.publicIpData.flatMap((pip: any) =>
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
            ],
      ),
      isSingleTunnel,
      localCidr: googleVpcResourcesparams.vpcCidrblock,
      peerCidr: azureVnetResourcesparams.vnetAddressSpace,
      vpcName: googleVpcResources.vpc.name,
      forwardingRuleResources: getForwardingRuleResources(
        googleVpnGateway,
        isSingleTunnel,
      ),
      labels: googleVpnParams.labels,
    },
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
  const localNetworkGatewayName = `${azureVnetResources.vnet.name}-${DESTINATION.GOOGLE}-lng`;

  resources.googleAzureLocalGateways = createAzureLocalGateways(
    scope,
    azureProvider,
    createLocalGatewayParams(
      azureVng.virtualNetworkGateway.id,
      DESTINATION.GOOGLE,
      getVpnGatewayIpAddresses(googleVpnGateway, isSingleTunnel).map(
        (address, index) => ({
          localNetworkGatewayName,
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
        }),
      ),
      isSingleTunnel,
      awsToAzure,
      awsToGoogle,
      googleToAzure,
      awsVpcResourcesparams.vpcCidrBlock,
      googleVpcResourcesparams.vpcCidrblock,
      azureVpnparams.localGwtags,
    ),
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function createVpnResources(
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider,
  azureProvider: AzurermProvider,
  awsVpcResources?: AwsVpcResources,
  googleVpcResources?: GoogleVpcResources,
  azureVnetResources?: AzureVnetResources,
): VpnResources {
  const resources: VpnResources = {};
  const isSingleTunnel = env === "dev";

  // ---------------------------------------------------------------------
  // Step 1: create each cloud's "hub" gateway resource, if that cloud
  // participates in at least one enabled connection.
  //
  // To add a new cloud that needs its own hub gateway, append one entry
  // here. `shouldCreate` decides whether the gateway is needed at all;
  // `create` performs the actual construct call and stores the result on
  // `resources`.
  // ---------------------------------------------------------------------
  const hubGatewaySteps: Array<{
    shouldCreate: () => boolean;
    create: () => void;
  }> = [
    {
      // AWS Virtual Private Gateway - needed whenever AWS peers with anything.
      shouldCreate: () => (awsToGoogle || awsToAzure) && !!awsVpcResources,
      create: () => {
        resources.awsVpnGateway = createAwsVpnGateway(scope, awsProvider, {
          vpcId: awsVpcResources!.vpc.id,
          amazonSideAsn: awsVpnparams.bgpAwsAsn,
          vgwName: `${awsVpcResourcesparams.vpcName}-vgw`,
          routeTableIds: [
            awsVpcResources!.publicRouteTable.id,
            awsVpcResources!.privateRouteTable.id,
          ],
          tags: awsVpnparams.vpnGatewayTags,
        });
      },
    },
    {
      // Google VPN Gateway (Single Tunnel and HA VPN) - needed whenever
      // Google peers with anything.
      shouldCreate: () =>
        (awsToGoogle || googleToAzure) &&
        !!googleVpcResources &&
        !resources.googleVpnGateways,
      create: () => {
        // Custom IP ranges are only meaningful for HA VPN, and only when
        // configured.
        const shouldUseCustomIpRanges =
          !isSingleTunnel &&
          googleVpnParams.customIpRanges &&
          googleVpnParams.customIpRanges.length > 0;

        resources.googleVpnGateways = createGoogleVpnGateway(
          scope,
          googleProvider,
          {
            vpcNetwork: googleVpcResources!.vpc.name,
            connectDestination: googleVpnParams.connectDestination,
            vpnGatewayName: googleVpnParams.vpnGatewayName,
            cloudRouterName: googleVpnParams.cloudRouterName,
            bgpGoogleAsn: googleVpnParams.bgpGoogleAsn,
            isSingleTunnel,
            ...(shouldUseCustomIpRanges && {
              customIpRanges: googleVpnParams.customIpRanges,
            }),
            labels: googleVpnParams.labels,
          },
        );
      },
    },
    {
      // Azure Virtual Network Gateway - needed whenever Azure peers with
      // anything.
      shouldCreate: () => (awsToAzure || googleToAzure) && !!azureVnetResources,
      create: () => {
        resources.azureVng = createAzureVpnGateway(
          scope,
          azureProvider,
          createAzureVpnGatewayConfig(
            azureVnetResources!,
            isSingleTunnel,
            awsToAzure,
            googleToAzure,
          ),
        );
      },
    },
  ];

  for (const step of hubGatewaySteps) {
    if (step.shouldCreate()) {
      step.create();
    }
  }

  // ---------------------------------------------------------------------
  // Step 2: set up each pairwise VPN connection that is enabled.
  //
  // To add a new pair (e.g. NewCloud <-> AWS), write a
  // `setupAwsToNewCloudVpn(...)` function above, following the existing
  // `setup<Cloud>To<Cloud>Vpn` functions as a template, then append one
  // entry here with its own enable condition. The order of this array is
  // the order the connections are provisioned in, matching the order used
  // before this refactor (AWS-Google, then AWS-Azure, then Google-Azure).
  // ---------------------------------------------------------------------
  const pairwiseConnectionSteps: Array<{
    shouldRun: () => boolean;
    run: () => void;
  }> = [
    {
      shouldRun: () => {
        const isGoogleToAzureHaEnabled =
          awsToAzure &&
          googleToAzure &&
          !isSingleTunnel &&
          !!googleVpcResources;
        return Boolean(
          isGoogleToAzureHaEnabled || (awsToGoogle && googleVpcResources),
        );
      },
      run: () =>
        setupAwsToGoogleVpn(
          scope,
          awsProvider,
          googleProvider,
          resources,
          googleVpcResources!,
          isSingleTunnel,
        ),
    },
    {
      shouldRun: () =>
        Boolean(awsToAzure && awsVpcResources && azureVnetResources),
      run: () =>
        setupAwsToAzureVpn(
          scope,
          awsProvider,
          azureProvider,
          resources,
          azureVnetResources!,
          resources.azureVng,
          isSingleTunnel,
        ),
    },
    {
      shouldRun: () =>
        Boolean(googleToAzure && googleVpcResources && azureVnetResources),
      run: () =>
        setupGoogleToAzureVpn(
          scope,
          googleProvider,
          azureProvider,
          resources,
          googleVpcResources!,
          azureVnetResources!,
          resources.azureVng,
          isSingleTunnel,
          awsToAzure,
          awsToGoogle,
          googleToAzure,
        ),
    },
  ];

  for (const step of pairwiseConnectionSteps) {
    if (step.shouldRun()) {
      step.run();
    }
  }

  return resources;
}
