import { PrivateDnsResolver } from "@cdktf/provider-azurerm/lib/private-dns-resolver";
import { PrivateDnsResolverDnsForwardingRuleset } from "@cdktf/provider-azurerm/lib/private-dns-resolver-dns-forwarding-ruleset";
import { PrivateDnsResolverForwardingRule } from "@cdktf/provider-azurerm/lib/private-dns-resolver-forwarding-rule";
import { PrivateDnsResolverInboundEndpoint } from "@cdktf/provider-azurerm/lib/private-dns-resolver-inbound-endpoint";
import { PrivateDnsResolverOutboundEndpoint } from "@cdktf/provider-azurerm/lib/private-dns-resolver-outbound-endpoint";
import { PrivateDnsResolverVirtualNetworkLink } from "@cdktf/provider-azurerm/lib/private-dns-resolver-virtual-network-link";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { Subnet } from "@cdktf/provider-azurerm/lib/subnet";
import { VirtualNetwork } from "@cdktf/provider-azurerm/lib/virtual-network";
import { Construct } from "constructs";

export interface AzurePrivateResolverParams {
  resourceGroupName: string;
  location: string;
  // Inbound endpoint subnet configuration
  dnsResolverInboundSubnetCidr: string;
  dnsResolverInboundSubnetName: string;
  // Outbound endpoint subnet configuration
  dnsResolverOutboundSubnetCidr: string;
  dnsResolverOutboundSubnetName: string;
  dnsPrivateResolverName: string;
  inboundEndpointName: string;
  outboundEndpointName: string; // Required name for the Outbound Endpoint
  // DNS Forwarding Ruleset configuration
  forwardingRulesetName?: string;
  forwardingRules?: Array<{
    name: string;
    domainName: string;
    enabled: boolean;
  }>;
  // Target IPs for forwarding (will be set dynamically)
  awsInboundEndpointIp?: string;
  googleCloudDnsIp?: string;
  tags: { [key: string]: string };
}

/**
 * Creates Azure DNS Private Resolver with Inbound and optional Outbound Endpoints.
 *
 * Inbound Endpoint: Allows external clouds (AWS/GCP) to resolve Azure Private DNS Zones.
 * Outbound Endpoint: Required for creating forwarding rules later (not created here)
 * to resolve external DNS from within Azure.
 */
export function createAzurePrivateResolver(
  scope: Construct,
  provider: AzurermProvider,
  virtualNetwork: VirtualNetwork,
  params: AzurePrivateResolverParams
) {
  // --- 1. Create dedicated subnets for DNS Private Resolver (Inbound and Outbound) ---
  const dnsResolverInboundSubnet = new Subnet(
    scope,
    "dns-resolver-inbound-subnet",
    {
      provider: provider,
      name: params.dnsResolverInboundSubnetName,
      resourceGroupName: params.resourceGroupName,
      virtualNetworkName: virtualNetwork.name,
      addressPrefixes: [params.dnsResolverInboundSubnetCidr],
      // Delegation is mandatory for DNS Resolver subnet
      delegation: [
        {
          name: "Microsoft.Network.dnsResolvers",
          serviceDelegation: {
            name: "Microsoft.Network/dnsResolvers",
            actions: ["Microsoft.Network/virtualNetworks/subnets/join/action"],
          },
        },
      ],
    }
  );

  const dnsResolverOutboundSubnet = new Subnet(
    scope,
    "dns-resolver-outbound-subnet",
    {
      provider: provider,
      name: params.dnsResolverOutboundSubnetName,
      resourceGroupName: params.resourceGroupName,
      virtualNetworkName: virtualNetwork.name,
      addressPrefixes: [params.dnsResolverOutboundSubnetCidr],
      // Delegation is mandatory for DNS Resolver subnet
      delegation: [
        {
          name: "Microsoft.Network.dnsResolvers",
          serviceDelegation: {
            name: "Microsoft.Network/dnsResolvers",
            actions: ["Microsoft.Network/virtualNetworks/subnets/join/action"],
          },
        },
      ],
    }
  );

  // --- 2. Create DNS Private Resolver ---
  const dnsResolver = new PrivateDnsResolver(scope, "dns-private-resolver", {
    provider: provider,
    name: params.dnsPrivateResolverName,
    resourceGroupName: params.resourceGroupName,
    location: params.location,
    virtualNetworkId: virtualNetwork.id,
    tags: params.tags,
  });

  // --- 3. Create Inbound Endpoint ---
  const inboundEndpoint = new PrivateDnsResolverInboundEndpoint(
    scope,
    "dns-resolver-inbound-endpoint",
    {
      provider: provider,
      name: params.inboundEndpointName,
      privateDnsResolverId: dnsResolver.id,
      location: params.location,
      ipConfigurations: {
        privateIpAllocationMethod: "Dynamic",
        subnetId: dnsResolverInboundSubnet.id,
      },
      tags: {
        ...params.tags,
        purpose: "receive-dns-queries-from-aws-gcp",
      },
    }
  );

  const output: any = {
    dnsResolver,
    inboundEndpoint,
    dnsResolverInboundSubnet,
    dnsResolverOutboundSubnet,
    resourceGroupName: params.resourceGroupName,
    location: params.location,
    virtualNetworkId: virtualNetwork.id,
  };

  // --- 4. Create Outbound Endpoint (Required) ---
  const outboundName = params.outboundEndpointName;

  // Create Outbound Endpoint (Used for sending queries to external networks)
  const outboundEndpoint = new PrivateDnsResolverOutboundEndpoint(
    scope,
    "dns-resolver-outbound-endpoint",
    {
      provider: provider,
      name: outboundName,
      privateDnsResolverId: dnsResolver.id,
      location: params.location,
      subnetId: dnsResolverOutboundSubnet.id,
      tags: {
        ...params.tags,
        purpose: "send-dns-queries-to-external-networks",
      },
    }
  );
  output.outboundEndpoint = outboundEndpoint;

  return output;
}

/**
 * Creates Azure DNS Forwarding Ruleset with forwarding rules to external clouds
 */
export function createAzureForwardingRuleset(
  scope: Construct,
  provider: AzurermProvider,
  params: {
    resourceGroupName: string;
    location: string;
    outboundEndpoints: PrivateDnsResolverOutboundEndpoint[];
    virtualNetworkId: string;
    forwardingRulesetName: string;
    forwardingRules: Array<{
      name: string;
      domainName: string;
      enabled: boolean;
      targetIps: string[];
    }>;
    tags: { [key: string]: string };
  }
) {
  // Create DNS Forwarding Ruleset
  const forwardingRuleset = new PrivateDnsResolverDnsForwardingRuleset(
    scope,
    "dns-forwarding-ruleset",
    {
      provider: provider,
      name: params.forwardingRulesetName,
      resourceGroupName: params.resourceGroupName,
      location: params.location,
      privateDnsResolverOutboundEndpointIds: params.outboundEndpoints.map(
        (endpoint) => endpoint.id
      ),
      tags: {
        ...params.tags,
        purpose: "forward-dns-to-aws-gcp",
      },
    }
  );

  // Create Virtual Network Link
  const virtualNetworkLink = new PrivateDnsResolverVirtualNetworkLink(
    scope,
    "dns-forwarding-vnet-link",
    {
      provider: provider,
      name: `${params.forwardingRulesetName}-vnet-link`,
      dnsForwardingRulesetId: forwardingRuleset.id,
      virtualNetworkId: params.virtualNetworkId,
    }
  );

  // Create forwarding rules
  const rules = params.forwardingRules
    .filter((rule) => rule.targetIps.length > 0) // Only create rules with target IPs
    .map((rule, index) => {
      return new PrivateDnsResolverForwardingRule(
        scope,
        `forwarding-rule-${index}`,
        {
          provider: provider,
          name: rule.name,
          dnsForwardingRulesetId: forwardingRuleset.id,
          domainName: rule.domainName,
          enabled: rule.enabled,
          targetDnsServers: rule.targetIps.map((ip) => ({
            ipAddress: ip,
            port: 53,
          })),
        }
      );
    });

  return {
    forwardingRuleset,
    virtualNetworkLink,
    rules,
  };
}
