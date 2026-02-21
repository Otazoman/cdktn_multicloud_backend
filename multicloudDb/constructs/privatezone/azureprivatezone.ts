import { PrivateDnsCnameRecord } from "@cdktn/provider-azurerm/lib/private-dns-cname-record";
import { PrivateDnsResolver } from "@cdktn/provider-azurerm/lib/private-dns-resolver";
import { PrivateDnsResolverDnsForwardingRuleset } from "@cdktn/provider-azurerm/lib/private-dns-resolver-dns-forwarding-ruleset";
import { PrivateDnsResolverForwardingRule } from "@cdktn/provider-azurerm/lib/private-dns-resolver-forwarding-rule";
import { PrivateDnsResolverInboundEndpoint } from "@cdktn/provider-azurerm/lib/private-dns-resolver-inbound-endpoint";
import { PrivateDnsResolverOutboundEndpoint } from "@cdktn/provider-azurerm/lib/private-dns-resolver-outbound-endpoint";
import { PrivateDnsResolverVirtualNetworkLink } from "@cdktn/provider-azurerm/lib/private-dns-resolver-virtual-network-link";
import { PrivateDnsZone } from "@cdktn/provider-azurerm/lib/private-dns-zone";
import { PrivateDnsZoneVirtualNetworkLink } from "@cdktn/provider-azurerm/lib/private-dns-zone-virtual-network-link";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Subnet } from "@cdktn/provider-azurerm/lib/subnet";
import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";
import { Construct } from "constructs";

export type AzureDatabaseType = "mysql" | "postgresql";

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
  params: AzurePrivateResolverParams,
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
    },
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
    },
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
    },
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
    },
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
      targetDnsServers: any;
    }>;
    tags: { [key: string]: string };
  },
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
        (endpoint) => endpoint.id,
      ),
      tags: {
        ...params.tags,
        purpose: "forward-dns-to-aws-gcp",
      },
    },
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
    },
  );

  // Create forwarding rules
  const rules = params.forwardingRules
    .filter((rule) => rule.targetDnsServers) // Only create rules with target servers
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
          targetDnsServers: rule.targetDnsServers,
        },
      );
    });

  return {
    forwardingRuleset,
    virtualNetworkLink,
    rules,
  };
}

/**
 * Creates shared Private DNS Zones for all database types and links them to the VNet
 */
export function createSharedPrivateDnsZones(
  scope: Construct,
  provider: AzurermProvider,
  resourceGroupName: string,
  virtualNetwork: VirtualNetwork,
  databaseTypes: Set<AzureDatabaseType>,
): Map<AzureDatabaseType, { privateDnsZone: any; vnetLink: any }> {
  const dnsZones = new Map<
    AzureDatabaseType,
    {
      privateDnsZone: any;
      vnetLink: any;
    }
  >();

  databaseTypes.forEach((dbType) => {
    // Use the standard Azure private link DNS zone format
    const dnsZoneName =
      dbType === "mysql"
        ? "privatelink.mysql.database.azure.com"
        : "privatelink.postgres.database.azure.com";

    const privateDnsZone = new PrivateDnsZone(
      scope,
      `azure-${dbType}-shared-dns-zone`,
      {
        provider: provider,
        name: dnsZoneName,
        resourceGroupName: resourceGroupName,
      },
    );

    // Link the Private DNS Zone to the Virtual Network
    const vnetLink = new PrivateDnsZoneVirtualNetworkLink(
      scope,
      `azure-${dbType}-shared-dns-vnet-link`,
      {
        provider: provider,
        name: `${dbType}-shared-vnet-link`,
        resourceGroupName: resourceGroupName,
        privateDnsZoneName: privateDnsZone.name,
        virtualNetworkId: virtualNetwork.id,
        registrationEnabled: false,
        dependsOn: [privateDnsZone, virtualNetwork],
      },
    );

    dnsZones.set(dbType, { privateDnsZone, vnetLink });
  });

  return dnsZones;
}

/**
 * Creates azure.inner Private DNS Zone for CNAME records
 */
export function createAzureInnerPrivateDnsZone(
  scope: Construct,
  provider: AzurermProvider,
  resourceGroupName: string,
  virtualNetwork: VirtualNetwork,
  zoneName: string = "azure.inner",
): { privateDnsZone: any; vnetLink: any } {
  const privateDnsZone = new PrivateDnsZone(scope, "azure-inner-dns-zone", {
    provider: provider,
    name: zoneName,
    resourceGroupName: resourceGroupName,
  });

  // Link the Private DNS Zone to the Virtual Network
  const vnetLink = new PrivateDnsZoneVirtualNetworkLink(
    scope,
    "azure-inner-dns-vnet-link",
    {
      provider: provider,
      name: "azure-inner-vnet-link",
      resourceGroupName: resourceGroupName,
      privateDnsZoneName: privateDnsZone.name,
      virtualNetworkId: virtualNetwork.id,
      registrationEnabled: false,
      dependsOn: [privateDnsZone, virtualNetwork],
    },
  );

  return { privateDnsZone, vnetLink };
}

/**
 * Creates CNAME records in azure.inner Private DNS Zone
 */
export function createAzureInnerCnameRecords(
  scope: Construct,
  provider: AzurermProvider,
  resourceGroupName: string,
  privateDnsZone: any,
  cnameRecords: Array<{
    name: string; // e.g., "mysql-prod"
    target: string; // e.g., "azure-mysql-server-2025-1108.privatelink.mysql.database.azure.com"
  }>,
): any[] {
  return cnameRecords.map((record, index) => {
    return new PrivateDnsCnameRecord(
      scope,
      `azure-inner-cname-${record.name}-${index}`,
      {
        provider: provider,
        name: record.name,
        resourceGroupName: resourceGroupName,
        zoneName: privateDnsZone.name,
        record: record.target,
        ttl: 300,
        dependsOn: [privateDnsZone],
      },
    );
  });
}
