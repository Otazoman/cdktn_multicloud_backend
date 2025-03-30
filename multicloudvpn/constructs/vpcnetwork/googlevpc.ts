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
  priority: number;
  destinationRanges?: string[];
}

interface GoogleResourcesParams {
  vpcName: string;
  subnets: SubnetConfig[];
  firewallIngressRules: FirewallRuleConfig[];
  firewallEgressRules: FirewallRuleConfig[];
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
    return new ComputeSubnetwork(scope, `${params.vpcName}-${subnet.name}`, {
      provider: provider,
      network: vpc.name,
      name: `${params.vpcName}-${subnet.name}`,
      ipCidrRange: subnet.cidr,
      region: subnet.region,
    });
  });

  // ssh(google)
  const sshrule = new ComputeFirewall(scope, "allowSsh", {
    provider: provider,
    network: vpc.name,
    name: `${params.vpcName}-ssh-allow-rule`,
    direction: "INGRESS",
    allow: [
      {
        protocol: "tcp",
        ports: ["22"],
      },
    ],
    sourceRanges: ["35.235.240.0/20"],
    priority: 1000,
  });

  // ingress rule
  const ingressrules = params.firewallIngressRules.map(
    (rule: FirewallRuleConfig) => {
      return new ComputeFirewall(scope, `allowInternal-${rule.name}`, {
        provider: provider,
        network: vpc.name,
        name: `${params.vpcName}-${rule.name}`,
        direction: "INGRESS",
        allow: [
          {
            protocol: "all",
          },
        ],
        sourceRanges: rule.sourceRanges,
        priority: rule.priority,
      });
    }
  );

  // egress rule
  const egressrules = params.firewallEgressRules.map(
    (rule: FirewallRuleConfig) => {
      return new ComputeFirewall(scope, `allowVpnExternal-${rule.name}`, {
        provider: provider,
        network: vpc.name,
        name: `${params.vpcName}-${rule.name}`,
        direction: "EGRESS",
        allow: [
          {
            protocol: "all",
          },
        ],
        sourceRanges: rule.sourceRanges,
        destinationRanges: rule.destinationRanges,
        priority: rule.priority,
      });
    }
  );

  return { vpc, subnets, sshrule, ingressrules, egressrules };
}
