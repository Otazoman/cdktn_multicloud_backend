import { ComputeAddress } from "@cdktf/provider-google/lib/compute-address";
import { ComputeForwardingRule } from "@cdktf/provider-google/lib/compute-forwarding-rule";
import { ComputeHaVpnGateway } from "@cdktf/provider-google/lib/compute-ha-vpn-gateway";
import { ComputeRouter } from "@cdktf/provider-google/lib/compute-router";
import { ComputeVpnGateway } from "@cdktf/provider-google/lib/compute-vpn-gateway";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
import { Construct } from "constructs";

interface GoogleVpnParams {
  vpcNetwork: string;
  connectDestination: string;
  vpnGatewayName: string;
  cloudRouterName: string;
  bgpGoogleAsn: number;
  vpnConnection?: {
    tunnel1: { peerIp: string; sharedSecret: string };
    tunnel2?: { peerIp: string; sharedSecret: string };
  };
  gcpVpcCidr?: string;
  peerVpcCidr?: string;
  isSingleTunnel: boolean;
}

export function createGoogleVpnGateway(
  scope: Construct,
  provider: GoogleProvider,
  params: GoogleVpnParams
) {
  if (params.isSingleTunnel) {
    // Single
    return createSingleTunnelVpnGateway(scope, provider, params);
  } else {
    // HA
    return createHaVpnGateway(scope, provider, params);
  }
}

function createSingleTunnelVpnGateway(
  scope: Construct,
  provider: GoogleProvider,
  params: GoogleVpnParams
) {
  // External ip address
  const gcpCmkVgwAddress = new ComputeAddress(scope, "gcp_cmk_vgw_address", {
    provider,
    name: `${params.vpnGatewayName}-ip`,
  });

  // VPN Gateway
  const gcpCmkVgw = new ComputeVpnGateway(scope, "gcp_cmk_vgw", {
    provider,
    name: params.vpnGatewayName,
    network: params.vpcNetwork,
  });

  // Forwording rule
  const forwardingRules = {
    esp: { protocol: "ESP", port: undefined },
    udp500: { protocol: "UDP", port: "500" },
    udp4500: { protocol: "UDP", port: "4500" },
  };

  const forwardingRuleResources: ComputeForwardingRule[] = [];

  Object.entries(forwardingRules).forEach(([key, value]) => {
    const forwardingRule = new ComputeForwardingRule(scope, `vpn_rule_${key}`, {
      provider,
      name: `fr-${params.connectDestination}-${gcpCmkVgw.name}-${key}`,
      ipProtocol: value.protocol,
      ipAddress: gcpCmkVgwAddress.address,
      target: gcpCmkVgw.selfLink,
      ...(value.protocol === "UDP" && value.port
        ? { portRange: value.port }
        : {}),
    });
    forwardingRuleResources.push(forwardingRule);
  });

  return {
    vpnGateway: gcpCmkVgw,
    externalIp: [gcpCmkVgwAddress],
    forwardingRuleResources: { forwardingRules: forwardingRuleResources },
  };
}

function createHaVpnGateway(
  scope: Construct,
  provider: GoogleProvider,
  params: GoogleVpnParams
) {
  // HA VPN Gateway
  const vpnGateway = new ComputeHaVpnGateway(
    scope,
    `${params.connectDestination}_gcp_ha_vpn`,
    {
      provider: provider,
      name: params.vpnGatewayName,
      network: params.vpcNetwork,
    }
  );

  // Cloud Router
  const cloudRouter = new ComputeRouter(
    scope,
    `${params.connectDestination}_gcp_router`,
    {
      provider: provider,
      name: params.cloudRouterName,
      network: params.vpcNetwork,
      bgp: {
        asn: params.bgpGoogleAsn,
      },
    }
  );

  // External IP addresses for HA VPN Gateway
  const externalIps = [0, 1].map((index) => {
    return new ComputeAddress(
      scope,
      `${params.connectDestination}_ha_vpn_ip_${index}`,
      {
        provider,
        name: `${params.vpnGatewayName}-ha-ip-${index}`,
      }
    );
  });

  return { vpnGateway, cloudRouter, externalIp: externalIps };
}
