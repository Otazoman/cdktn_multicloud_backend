import {
  awsVpcResourcesparams,
  awsVpnparams,
  createCustomerGatewayParams,
} from "../../config/aws/awssettings";
import {
  googleVpcResourcesparams,
  googleVpnParams,
} from "../../config/google/googlesettings";
import { createAwsCustomerGateway } from "../../constructs/vpnnetwork/awscgw";
import { CloudContext } from "../../clouds/types";
import { VpnConnectionResources, VpnResources } from "./types";
import {
  DESTINATION,
  GOOGLE_DNS_RANGE,
  createAwsVpnRoutes,
  extractAwsVpnTunnels,
  getCgwLogGroupArn,
  getCloudRouter,
  getForwardingRuleResources,
  setupGoogleVpnTunnels,
  isComputeHaVpnGateway,
  requireGateway,
} from "./helpers";

// ---------------------------------------------------------------------------
// AWS <-> Google VPN
// ---------------------------------------------------------------------------

export function setupAwsToGoogleVpn(
  ctx: CloudContext,
  resources: VpnResources,
  isSingleTunnel: boolean,
): void {
  const { scope } = ctx;
  const awsProvider = ctx.providers.aws;
  const googleProvider = ctx.providers.google;
  const googleVpcResources = ctx.outputs.google.vpc!;
  const awsResourcesOutput = ctx.outputs.aws;
  const connection: VpnConnectionResources = {};
  resources.connections["aws-google"] = connection;

  const googleGateway = requireGateway(resources.gateways.google, "Google");
  const awsVpnGateway = requireGateway(resources.gateways.aws, "AWS");
  const haGateway = isComputeHaVpnGateway(googleGateway.vpnGateway)
    ? googleGateway.vpnGateway
    : undefined;
  const googleVpnGatewayIpAddresses = isSingleTunnel
    ? [googleGateway.externalIp?.[0]?.address ?? ""]
    : ([
        haGateway?.vpnInterfaces.get(0)?.ipAddress,
        haGateway?.vpnInterfaces.get(1)?.ipAddress,
      ].filter(Boolean) as string[]);

  // AWS Customer Gateway
  connection.customerGateways = createAwsCustomerGateway(
    scope,
    awsProvider,
    createCustomerGatewayParams(
      DESTINATION.GOOGLE,
      googleVpnParams.bgpGoogleAsn,
      awsVpnGateway.id,
      googleVpnGatewayIpAddresses,
      isSingleTunnel,
      getCgwLogGroupArn(awsResourcesOutput, DESTINATION.GOOGLE),
      awsVpnparams.customerGatewayTags,
    ),
  );

  // Google VPN Tunnels
  connection.googleTunnels = setupGoogleVpnTunnels(scope, googleProvider, {
    vpnGateway: googleGateway,
    cloudRouter: getCloudRouter(googleGateway, isSingleTunnel),
    peerAsn: awsVpnparams.bgpAwsAsn,
    destination: DESTINATION.AWS,
    vpnParams: googleVpnParams,
    vpnConnections: extractAwsVpnTunnels(
      connection.customerGateways,
      isSingleTunnel,
    ),
    isSingleTunnel,
    localCidr: googleVpcResourcesparams.vpcCidrblock,
    peerCidr: awsVpcResourcesparams.vpcCidrBlock,
    vpcName: googleVpcResources.vpc.name,
    forwardingRuleResources: getForwardingRuleResources(
      googleGateway,
      isSingleTunnel,
    ),
    labels: googleVpnParams.labels,
  });

  // Single tunnel routes - VPC CIDR, CloudSQL range, and Google DNS range
  if (isSingleTunnel && connection.customerGateways?.[0]?.vpnConnection?.id) {
    const vpnConnectionId = connection.customerGateways[0].vpnConnection.id;

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
