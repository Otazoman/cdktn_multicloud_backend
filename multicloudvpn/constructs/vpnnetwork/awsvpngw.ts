import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { VpnGateway } from "@cdktn/provider-aws/lib/vpn-gateway";
import { VpnGatewayRoutePropagation } from "@cdktn/provider-aws/lib/vpn-gateway-route-propagation";
import { NullProvider } from "@cdktn/provider-null/lib/provider";
import { Construct } from "constructs";

interface VpnGatewayParams {
  vpcId: string;
  vgwName: string;
  amazonSideAsn: number;
  routeTableId: string;
  tags?: { [key: string]: string };
}

export function createAwsVpnGateway(
  scope: Construct,
  provider: AwsProvider,
  params: VpnGatewayParams
) {
  // For ensuring power equality when re-running
  new NullProvider(scope, "null-provider-vpn", {
    alias: "null-vpn",
  });

  // Creating a Virtual Private Gateway
  const vpnGateway = new VpnGateway(scope, "cmk_vgw", {
    provider: provider,
    vpcId: params.vpcId,
    amazonSideAsn: params.amazonSideAsn as unknown as string,
    tags: {
      Name: params.vgwName,
      ...(params.tags || {}),
    },
  });

  // Configure route propagation for virtual private gateways
  new VpnGatewayRoutePropagation(scope, `vgw-route-propagation`, {
    provider: provider,
    routeTableId: params.routeTableId,
    vpnGatewayId: vpnGateway.id,
  });

  return vpnGateway;
}
