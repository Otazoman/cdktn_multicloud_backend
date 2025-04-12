import { DataAwsRouteTables } from "@cdktf/provider-aws/lib/data-aws-route-tables";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { VpnGateway } from "@cdktf/provider-aws/lib/vpn-gateway";
import { VpnGatewayRoutePropagation } from "@cdktf/provider-aws/lib/vpn-gateway-route-propagation";
import { NullProvider } from "@cdktf/provider-null/lib/provider";
import { Resource } from "@cdktf/provider-null/lib/resource";
import { Fn } from "cdktf";
import { Construct } from "constructs";

interface VpnGatewayParams {
  vpcId: string;
  vgwName: string;
  amazonSideAsn: number;
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
    },
  });

  // Configure route propagation for virtual private gateways
  const defaultRouteTable = new DataAwsRouteTables(
    scope,
    "default_route_table",
    {
      provider: provider,
      vpcId: params.vpcId,
      filter: [
        {
          name: "association.main",
          values: ["true"],
        },
      ],
    }
  );

  const propagation = new VpnGatewayRoutePropagation(scope, "cmk_vgw_rp", {
    provider: provider,
    vpnGatewayId: vpnGateway.id,
    routeTableId: Fn.element(defaultRouteTable.ids, 0),
    dependsOn: [vpnGateway, defaultRouteTable],
    lifecycle: {
      ignoreChanges: ["route_table_id"],
    },
  });

  new Resource(scope, "refresh_propagation", {
    dependsOn: [propagation],
    triggers: {
      timestamp: "static-timestamp-value",
    },
  });

  return vpnGateway;
}
