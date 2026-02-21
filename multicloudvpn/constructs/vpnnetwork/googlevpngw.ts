import { ComputeAddress } from "@cdktn/provider-google/lib/compute-address";
import { ComputeForwardingRule } from "@cdktn/provider-google/lib/compute-forwarding-rule";
import { ComputeHaVpnGateway } from "@cdktn/provider-google/lib/compute-ha-vpn-gateway";
import { ComputeRouter } from "@cdktn/provider-google/lib/compute-router";
import { ComputeVpnGateway } from "@cdktn/provider-google/lib/compute-vpn-gateway";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";

interface GoogleVpnParams {
  vpcNetwork: string;
  connectDestination: string;
  vpnGatewayName: string;
  cloudRouterName: string;
  bgpGoogleAsn: number;
  isSingleTunnel: boolean;
  labels?: { [key: string]: string };
}

export function createGoogleVpnGateway(
  scope: Construct,
  provider: GoogleProvider,
  params: GoogleVpnParams
) {
  // Determine whether to create a single VPN tunnel gateway or an HA VPN gateway
  if (params.isSingleTunnel) {
    return createSingleTunnelVpnGateway(scope, provider, params);
  } else {
    return createHaVpnGateway(scope, provider, params);
  }
}

function createSingleTunnelVpnGateway(
  scope: Construct,
  provider: GoogleProvider,
  params: GoogleVpnParams
) {
  // Create external IP address for the VPN Gateway
  const gcpCmkVgwAddress = new ComputeAddress(
    scope,
    `${params.connectDestination}_gcp_cmk_vgw_address`,
    {
      provider,
      name: `${params.vpnGatewayName}-ip`,
      labels: params.labels,
    }
  );

  // Create VPN Gateway
  const gcpCmkVgw = new ComputeVpnGateway(
    scope,
    `${params.connectDestination}_gcp_cmk_vgw`,
    {
      provider,
      name: params.vpnGatewayName,
      network: params.vpcNetwork,
    }
  );

  // Define forwarding rules
  const forwardingRules = {
    esp: { protocol: "ESP", port: undefined },
    udp500: { protocol: "UDP", port: "500" },
    udp4500: { protocol: "UDP", port: "4500" },
  };

  const forwardingRuleResources: ComputeForwardingRule[] = [];

  Object.entries(forwardingRules).forEach(([key, value]) => {
    const forwardingRule = new ComputeForwardingRule(
      scope,
      `vpn_rule_${params.connectDestination}_${key}`,
      {
        provider,
        name: `fr-${params.connectDestination}-${gcpCmkVgw.name}-${key}`,
        ipProtocol: value.protocol,
        ipAddress: gcpCmkVgwAddress.address,
        target: gcpCmkVgw.selfLink,
        ...(value.protocol === "UDP" && value.port
          ? { portRange: value.port }
          : {}),
      }
    );
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
  // Create HA VPN Gateway
  const vpnGateway = new ComputeHaVpnGateway(
    scope,
    `${params.connectDestination}_gcp_ha_vpn`,
    {
      provider: provider,
      name: params.vpnGatewayName,
      network: params.vpcNetwork,
      labels: params.labels,
    }
  );

  // Create Cloud Router

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

  // Create external IP addresses for the HA VPN Gateway
  const externalIps = [0, 1].map((index) => {
    return new ComputeAddress(
      scope,
      `${params.connectDestination}_ha_vpn_ip_${index}`,
      {
        provider,
        name: `${params.vpnGatewayName}-ha-ip-${index}`,
        labels: params.labels,
      }
    );
  });

  return { vpnGateway, cloudRouter, externalIp: externalIps };
}
