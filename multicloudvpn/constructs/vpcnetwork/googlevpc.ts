import { ComputeFirewall } from "@cdktf/provider-google/lib/compute-firewall";
import { ComputeNetwork as GoogleVpc } from "@cdktf/provider-google/lib/compute-network";
import { ComputeSubnetwork } from "@cdktf/provider-google/lib/compute-subnetwork";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
import { Construct } from "constructs";

interface SubnetConfig {
  name: string;
  cidr: string;
  region: string;
  labels?: { [key: string]: string };
}

interface FirewallRuleConfig {
  name: string;
  sourceRanges: string[];
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
    description: `VPC Network: ${params.vpcName}${
      params.vpcLabels ? ` - Labels: ${JSON.stringify(params.vpcLabels)}` : ""
    }`,
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
        description: `Subnet: ${params.vpcName}-${subnet.name}${
          subnet.labels ? ` - Labels: ${JSON.stringify(subnet.labels)}` : ""
        }`,
      }
    );
    return subnetwork;
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
    description: `SSH Firewall Rule: ${params.vpcName}-ssh-allow-rule${
      params.sshFirewallLabels
        ? ` - Labels: ${JSON.stringify(params.sshFirewallLabels)}`
        : ""
    }`,
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
          allow: [
            {
              protocol: "all",
            },
          ],
          sourceRanges: rule.sourceRanges,
          priority: rule.priority,
          description: `Ingress Firewall Rule: ${params.vpcName}-${rule.name}${
            params.firewallLabels
              ? ` - Labels: ${JSON.stringify(params.firewallLabels)}`
              : ""
          }`,
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
          allow: [
            {
              protocol: "all",
            },
          ],
          sourceRanges: rule.sourceRanges,
          destinationRanges: rule.destinationRanges,
          priority: rule.priority,
          description: `Egress Firewall Rule: ${params.vpcName}-${rule.name}${
            params.firewallLabels
              ? ` - Labels: ${JSON.stringify(params.firewallLabels)}`
              : ""
          }`,
        }
      );
      return egressRule;
    }
  );

  return { vpc, subnets, sshrule, ingressrules, egressrules };
}
