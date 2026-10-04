import {
  awsVpcResourcesparams,
  awsVpnparams,
  createCustomerGatewayParams,
} from "../../config/aws/awssettings";
import {
  azureVnetResourcesparams,
  azureVpnparams,
  createLocalGatewayParams,
} from "../../config/azure/azuresettings";
import { createAwsCustomerGateway } from "../../constructs/vpnnetwork/awscgw";
import { createAzureLocalGateways } from "../../constructs/vpnnetwork/azurelocalgwcon";
import { CloudContext } from "../../clouds/types";
import { vpnAddressPlan } from "../../config/vpn/addressPlan";
import { VpnConnectionResources, VpnResources } from "./types";
import {
  AWS_TUNNEL_INDEXES,
  awsTunnel,
  DESTINATION,
  createAwsVpnRoutes,
  getCgwLogGroupArn,
  requireGateway,
} from "./helpers";

// ---------------------------------------------------------------------------
// AWS <-> Azure VPN
// ---------------------------------------------------------------------------

export function setupAwsToAzureVpn(
  ctx: CloudContext,
  resources: VpnResources,
  isSingleTunnel: boolean,
): void {
  const { scope } = ctx;
  const awsProvider = ctx.providers.aws;
  const azureProvider = ctx.providers.azure;
  const azureVng = requireGateway(resources.gateways.azure, "Azure");
  const awsResourcesOutput = ctx.outputs.aws;
  const connection: VpnConnectionResources = {};
  resources.connections["aws-azure"] = connection;
  // BGP inside addresses: [Azure gateway instance][AWS tunnel]
  const plan = vpnAddressPlan.awsAzure.tunnels;

  // Create AWS Customer Gateway
  connection.customerGateways = createAwsCustomerGateway(scope, awsProvider, {
    ...createCustomerGatewayParams(
      DESTINATION.AZURE,
      azureVpnparams.azureAsn,
      requireGateway(resources.gateways.aws, "AWS").id,
      azureVng.publicIpData.map((pip) => pip.ipAddress),
      isSingleTunnel,
      getCgwLogGroupArn(awsResourcesOutput, DESTINATION.AZURE),
      awsVpnparams.customerGatewayTags,
    ),
    azureVpnProps: {
      // Inside CIDRs per VPN connection (= Azure gateway instance)
      awsGwIpCidr1: plan.map((instance) => instance[0].insideCidr),
      awsGwIpCidr2: plan.map((instance) => instance[1].insideCidr),
    },
  });

  // Create Azure Local Gateways (names: localNetworkGateways in azure/vpn.ts)

  connection.localGateways = createAzureLocalGateways(
    scope,
    azureProvider,
    createLocalGatewayParams(
      azureVng.virtualNetworkGateway.id,
      DESTINATION.AWS,
      connection.customerGateways.flatMap((cgw, index) => {
        const conn = cgw.vpnConnection;
        if (!conn) return [];

        return AWS_TUNNEL_INDEXES.map((n) => ({
          localGatewayAddress: awsTunnel(conn, n).address,
          localAddressSpaces: [awsVpcResourcesparams.vpcCidrBlock],
          sharedKey: awsTunnel(conn, n).presharedKey,
          bgpSettings: {
            asn: awsVpnparams.bgpAwsAsn,
            bgpPeeringAddress: plan[index][n - 1].awsIp,
          },
          // Azure-side address of AWS tunnel n on each VNG instance
          customBgpAddresses: {
            primary: plan[0][n - 1].azureIp,
            secondary: plan[1][n - 1].azureIp,
          },
        }));
      }),
      isSingleTunnel,
      azureVpnparams.localGwtags,
    ),
  );

  // Create routes for single tunnel
  if (isSingleTunnel && connection.customerGateways[0]?.vpnConnection?.id) {
    createAwsVpnRoutes(
      scope,
      awsProvider,
      connection.customerGateways[0].vpnConnection.id,
      DESTINATION.AZURE,
      azureVnetResourcesparams.vnetAddressSpace,
    );
  }
}
