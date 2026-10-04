import {
  azureVnetResourcesparams,
  azureVpnparams,
  createLocalGatewayParams,
} from "../../config/azure/azuresettings";
import {
  googleVpcResourcesparams,
  googleVpnParams,
} from "../../config/google/googlesettings";
import { createAzureLocalGateways } from "../../constructs/vpnnetwork/azurelocalgwcon";
import { CloudContext } from "../../clouds/types";
import { vpnAddressPlan } from "../../config/vpn/addressPlan";
import { VpnConnectionResources, VpnResources } from "./types";
import {
  DESTINATION,
  getCloudRouter,
  getForwardingRuleResources,
  getVpnGatewayIpAddresses,
  setupGoogleVpnTunnels,
  requireGateway,
} from "./helpers";

// ---------------------------------------------------------------------------
// Google <-> Azure VPN
// ---------------------------------------------------------------------------

export function setupGoogleToAzureVpn(
  ctx: CloudContext,
  resources: VpnResources,
  isSingleTunnel: boolean,
): void {
  const { scope } = ctx;
  const googleProvider = ctx.providers.google;
  const azureProvider = ctx.providers.azure;
  const googleVpcResources = ctx.outputs.google.vpc!;
  const azureVng = requireGateway(resources.gateways.azure, "Azure");
  const connection: VpnConnectionResources = {};
  resources.connections["google-azure"] = connection;
  // BGP inside addresses and pre-shared key per Azure gateway instance
  const plan = vpnAddressPlan.googleAzure;
  const googleVpnGateway = resources.gateways.google;

  if (!googleVpnGateway) {
    throw new Error("Google VPN Gateway not found for Google-Azure VPN setup.");
  }

  // Setup Google VPN Tunnels
  connection.googleTunnels = setupGoogleVpnTunnels(
    scope,
    googleProvider,
    {
      vpnGateway: googleVpnGateway,
      cloudRouter: getCloudRouter(googleVpnGateway, isSingleTunnel),
      peerAsn: azureVpnparams.azureAsn,
      destination: DESTINATION.AZURE,
      vpnParams: googleVpnParams,
      // HA: tunnel i <-> Azure VNG instance i (publicIpData[i]).
      // BGP addresses of tunnel i (plan.tunnels[i]) are on Azure instance i.
      vpnConnections: isSingleTunnel
        ? [
            {
              address: azureVng.publicIpData[0].ipAddress,
              ipAddress: plan.tunnels[0].googleIp,
              preshared_key: plan.presharedKey,
              peerAddress: azureVng.publicIpData[0].ipAddress,
            },
          ]
        : azureVng.publicIpData.map((pip, index) => ({
            address: pip.ipAddress,
            ipAddress: plan.tunnels[index].googleIp,
            preshared_key: plan.presharedKey,
            peerAddress: plan.tunnels[index].azureIp,
          })),
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

  // Create Azure Local Gateways (names: localNetworkGateways in azure/vpn.ts)

  connection.localGateways = createAzureLocalGateways(
    scope,
    azureProvider,
    createLocalGatewayParams(
      azureVng.virtualNetworkGateway.id,
      DESTINATION.GOOGLE,
      getVpnGatewayIpAddresses(googleVpnGateway, isSingleTunnel).map(
        (address, index) => ({
          localGatewayAddress: address,
          localAddressSpaces: googleLocalAddressSpaces,
          sharedKey: plan.presharedKey,
          bgpSettings: {
            asn: googleVpnParams.bgpGoogleAsn,
            bgpPeeringAddress: plan.tunnels[index].googleIp,
          },
          // Azure-side address for Google on each VNG instance
          customBgpAddresses: {
            primary: plan.tunnels[0].azureIp,
            secondary: plan.tunnels[1].azureIp,
          },
        }),
      ),
      isSingleTunnel,
      azureVpnparams.localGwtags,
    ),
  );
}
