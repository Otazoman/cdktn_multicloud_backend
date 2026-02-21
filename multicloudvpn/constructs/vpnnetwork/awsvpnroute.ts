import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { VpnConnectionRoute } from "@cdktn/provider-aws/lib/vpn-connection-route";
import { Construct } from "constructs";

interface RouteConfig {
  target: string;
  cidrBlock: string;
}

interface VpnConnectionRouteParams {
  routes: RouteConfig[];
  vpnConnectionId: string;
}

export function createVpnConnectionRoutes(
  scope: Construct,
  provider: AwsProvider,
  params: VpnConnectionRouteParams
) {
  params.routes.forEach((route) => {
    new VpnConnectionRoute(scope, `${route.target.toLowerCase()}_route`, {
      provider: provider,
      destinationCidrBlock: route.cidrBlock,
      vpnConnectionId: params.vpnConnectionId,
    });
  });
}
