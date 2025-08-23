import { ComputeFirewall } from "@cdktf/provider-google/lib/compute-firewall";
import { ComputeNetwork as GoogleVpc } from "@cdktf/provider-google/lib/compute-network";
import { ComputeSubnetwork } from "@cdktf/provider-google/lib/compute-subnetwork";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
import { Construct } from "constructs";

interface SubnetConfig {
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
  firewallLabels?: { [key: string]: string };
  firewallIngressRules: FirewallRuleConfig[];
  firewallEgressRules: FirewallRuleConfig[];
  sshFirewallLabels?: { [key: string]: string };
}

export function createGoogleVpcResources(
  scope: Construct,
  provider: GoogleProvider,
  params: GoogleResourcesParams
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
      }
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
        }
      );
      return ingressRule;
    }
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
        }
      );
      return egressRule;
    }
  );

  return { vpc, subnets, ingressrules, egressrules };
}
