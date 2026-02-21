import { ComputeAddress } from "@cdktn/provider-google/lib/compute-address";
import { ComputeFirewall } from "@cdktn/provider-google/lib/compute-firewall";
import { ComputeNetwork as GoogleVpc } from "@cdktn/provider-google/lib/compute-network";
import { ComputeRouter } from "@cdktn/provider-google/lib/compute-router";
import { ComputeRouterNat } from "@cdktn/provider-google/lib/compute-router-nat";
import { ComputeSubnetwork } from "@cdktn/provider-google/lib/compute-subnetwork";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";

interface SubnetConfig {
  name: string;
  cidr: string;
  region: string;
}

interface ProxySubnetConfig {
  name: string;
  cidr: string;
  region: string;
}

interface FirewallRuleConfig {
  name: string;
  sourceRanges: string[];
  permission: {
    protocol: string;
    ports?: string[];
  };
  priority: number;
  destinationRanges?: string[];
}

interface GoogleResourcesParams {
  vpcName: string;
  vpcLabels?: { [key: string]: string };
  subnets: SubnetConfig[];
  proxySubnets?: ProxySubnetConfig[];
  firewallLabels?: { [key: string]: string };
  firewallIngressRules: FirewallRuleConfig[];
  firewallEgressRules: FirewallRuleConfig[];
  sshFirewallLabels?: { [key: string]: string };
  natConfig: {
    enable?: boolean;
    name: string;
    region: string;
    routerName: string;
  };
}

export function createGoogleVpcResources(
  scope: Construct,
  provider: GoogleProvider,
  params: GoogleResourcesParams,
) {
  // vpc
  const vpc = new GoogleVpc(scope, "googleVpc", {
    provider: provider,
    name: params.vpcName,
    autoCreateSubnetworks: false,
  });

  // subnets
  const subnets = params.subnets.map((subnet: SubnetConfig) => {
    const subnetwork = new ComputeSubnetwork(
      scope,
      `${params.vpcName}-${subnet.name}`,
      {
        provider: provider,
        network: vpc.name,
        name: `${params.vpcName}-${subnet.name}`,
        ipCidrRange: subnet.cidr,
        region: subnet.region,
      },
    );
    return subnetwork;
  });

  // ingress rule
  const ingressrules = params.firewallIngressRules.map(
    (rule: FirewallRuleConfig) => {
      const ingressRule = new ComputeFirewall(
        scope,
        `allowInternal-${rule.name}`,
        {
          provider: provider,
          network: vpc.name,
          name: `${params.vpcName}-${rule.name}`,
          direction: "INGRESS",
          allow: [rule.permission],
          sourceRanges: rule.sourceRanges,
          priority: rule.priority,
        },
      );
      return ingressRule;
    },
  );

  // egress rule
  const egressrules = params.firewallEgressRules.map(
    (rule: FirewallRuleConfig) => {
      const egressRule = new ComputeFirewall(
        scope,
        `allowVpnExternal-${rule.name}`,
        {
          provider: provider,
          network: vpc.name,
          name: `${params.vpcName}-${rule.name}`,
          direction: "EGRESS",
          allow: [rule.permission],
          sourceRanges: rule.sourceRanges,
          destinationRanges: rule.destinationRanges,
          priority: rule.priority,
        },
      );
      return egressRule;
    },
  );

  // Cloud NAT
  let router;
  let natGateway;
  let natIpAddress;
  if (params.natConfig.enable) {
    natIpAddress = new ComputeAddress(scope, "cloudNatIp", {
      provider: provider,
      name: `${params.natConfig.name}-ip`,
      region: params.natConfig.region,
    });
    router = new ComputeRouter(scope, "cloudRouter", {
      provider: provider,
      name: params.natConfig.routerName,
      network: vpc.id,
      region: params.natConfig.region,
    });
    natGateway = new ComputeRouterNat(scope, "cloudNat", {
      provider: provider,
      name: params.natConfig.name,
      router: router.name,
      region: params.natConfig.region,
      sourceSubnetworkIpRangesToNat: "ALL_SUBNETWORKS_ALL_IP_RANGES",
      natIpAllocateOption: "MANUAL_ONLY",
      natIps: [natIpAddress.selfLink],
      logConfig: {
        enable: true,
        filter: "ALL",
      },
    });
  }

  // Proxy Subnets
  const proxySubnets = params.proxySubnets?.map((subnet: ProxySubnetConfig) => {
    return new ComputeSubnetwork(
      scope,
      `${params.vpcName}-${subnet.name}-proxy`,
      {
        provider: provider,
        network: vpc.name,
        name: `${params.vpcName}-${subnet.name}`,
        ipCidrRange: subnet.cidr,
        region: subnet.region,
        purpose: "REGIONAL_MANAGED_PROXY",
        role: "ACTIVE",
      },
    );
  });

  return {
    vpc,
    subnets,
    proxySubnets,
    ingressrules,
    egressrules,
    router,
    natIpAddress,
    natGateway,
  };
}
