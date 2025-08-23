import { DefaultRouteTable } from "@cdktf/provider-aws/lib/default-route-table"; // ★ DefaultRouteTable をインポート ★
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { VpnGateway } from "@cdktf/provider-aws/lib/vpn-gateway";
import { NullProvider } from "@cdktf/provider-null/lib/provider";
import { Construct } from "constructs";

interface VpnGatewayParams {
  vpcId: string;
  vgwName: string;
  amazonSideAsn: number;
  defaultRouteTableId: string;
  defaultRouteTableName: string;
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
  new DefaultRouteTable(scope, "defaultRouteTable", {
    provider: provider,
    defaultRouteTableId: params.defaultRouteTableId,
    tags: {
      Name: params.defaultRouteTableName,
    },
    propagatingVgws: [vpnGateway.id],
  });

  return vpnGateway;
}
