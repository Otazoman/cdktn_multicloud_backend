import { BastionHost } from "@cdktn/provider-azurerm/lib/bastion-host";
import { NatGateway } from "@cdktn/provider-azurerm/lib/nat-gateway";
import { NatGatewayPublicIpAssociation } from "@cdktn/provider-azurerm/lib/nat-gateway-public-ip-association";
import { NetworkSecurityGroup } from "@cdktn/provider-azurerm/lib/network-security-group";
import { NetworkSecurityRule } from "@cdktn/provider-azurerm/lib/network-security-rule";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { PublicIp } from "@cdktn/provider-azurerm/lib/public-ip";
import { Subnet } from "@cdktn/provider-azurerm/lib/subnet";
import { SubnetNatGatewayAssociation } from "@cdktn/provider-azurerm/lib/subnet-nat-gateway-association";
import { SubnetNetworkSecurityGroupAssociation } from "@cdktn/provider-azurerm/lib/subnet-network-security-group-association";
import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";
import { Construct } from "constructs";

// --- Interface Definitions ---

interface SubnetDelegation {
  name: string;
  serviceName: string;
}

interface SubnetConfig {
  name: string;
  cidr: string;
  delegations?: SubnetDelegation[];
}

interface NSGRuleConfig {
  name: string;
  priority: number;
  direction: string;
  access: string;
  protocol: string;
  sourcePortRange: string;
  destinationPortRange: string;
  sourceAddressPrefix: string;
  destinationAddressPrefix: string;
}

interface NSGConfig {
  name: string;
  subnetKeys: string[];
  tags: { [key: string]: string };
  rules: NSGRuleConfig[];
}

interface AzureResourcesParams {
  resourceGroupName: string;
  location: string;
  vnetName: string;
  vnetAddressSpace: string;
  vnetTags?: { [key: string]: string };
  subnets: SubnetConfig[];
  bastionSubnetcidr: string;
  nsgConfigs: NSGConfig[];
  natenabled: boolean;
  bastionenabled: boolean;
}

export function createAzureVnetResources(
  scope: Construct,
  provider: AzurermProvider,
  params: AzureResourcesParams
) {
  // --- Virtual Network ---
  const vnet = new VirtualNetwork(scope, "azureVnet", {
    provider: provider,
    name: params.vnetName,
    addressSpace: [params.vnetAddressSpace],
    location: params.location,
    resourceGroupName: params.resourceGroupName,
    tags: {
      Name: params.vnetName,
      ...(params.vnetTags || {}),
    },
  });

  // --- Subnets ---
  // Create all subnets first and store them in a map for easy lookup.
  const subnets: { [key: string]: Subnet } = {};
  for (const subnetConfig of params.subnets) {
    const subnetResource = new Subnet(
      scope,
      `myAzureSubnet-${subnetConfig.name}`,
      {
        provider: provider,
        resourceGroupName: params.resourceGroupName,
        virtualNetworkName: vnet.name,
        name: `${params.vnetName}-${subnetConfig.name}`,
        addressPrefixes: [subnetConfig.cidr],
        // Add delegation for services like Azure DB
        delegation: subnetConfig.delegations
          ? subnetConfig.delegations.map((d) => ({
              name: d.name,
              serviceDelegation: {
                name: d.serviceName,
                actions: [
                  "Microsoft.Network/virtualNetworks/subnets/join/action",
                ],
              },
            }))
          : [],
      }
    );
    subnets[subnetConfig.name] = subnetResource;
  }

  // --- Network Security Groups and Associations ---
  const nsgs: { [key: string]: NetworkSecurityGroup } = {};
  const nsgRules: { [key: string]: NetworkSecurityRule[] } = {};
  const subnetAssociations: SubnetNetworkSecurityGroupAssociation[] = [];

  for (const nsgConfig of params.nsgConfigs) {
    // Create the NSG
    const nsg = new NetworkSecurityGroup(scope, `nsg-${nsgConfig.name}`, {
      provider: provider,
      resourceGroupName: params.resourceGroupName,
      location: params.location,
      name: nsgConfig.name,
      tags: nsgConfig.tags,
    });
    nsgs[nsgConfig.name] = nsg;
    nsgRules[nsgConfig.name] = [];

    // Create the rules for this NSG
    for (const rule of nsgConfig.rules) {
      const nsgRule = new NetworkSecurityRule(
        scope,
        `nsgRule-${nsgConfig.name}-${rule.name}`,
        {
          provider: provider,
          resourceGroupName: params.resourceGroupName,
          networkSecurityGroupName: nsg.name,
          name: rule.name,
          priority: rule.priority,
          direction: rule.direction,
          access: rule.access,
          protocol: rule.protocol,
          sourcePortRange: rule.sourcePortRange,
          destinationPortRange: rule.destinationPortRange,
          sourceAddressPrefix: rule.sourceAddressPrefix,
          destinationAddressPrefix: rule.destinationAddressPrefix,
        }
      );
      nsgRules[nsgConfig.name].push(nsgRule);
    }

    // Associate the NSG with its designated subnets
    for (const subnetKey of nsgConfig.subnetKeys) {
      const subnetResource = subnets[subnetKey];
      if (subnetResource) {
        const association = new SubnetNetworkSecurityGroupAssociation(
          scope,
          `nsgAssoc-${subnetKey}`,
          {
            provider: provider,
            subnetId: subnetResource.id,
            networkSecurityGroupId: nsg.id,
            dependsOn: [subnetResource, nsg],
          }
        );
        subnetAssociations.push(association);
      }
    }
  }

  // --- NAT Gateway ---
  if (params.natenabled) {
    const natPublicIp = new PublicIp(scope, "AzureNatPublicIp", {
      provider,
      name: `${params.vnetName}-nat-pip`,
      location: params.location,
      resourceGroupName: params.resourceGroupName,
      allocationMethod: "Static",
      sku: "Standard",
      tags: {
        Name: `${params.vnetName}-nat-pip`,
        ...(params.vnetTags || {}),
      },
    });

    const natGateway = new NatGateway(scope, "AzureNatGateway", {
      provider,
      name: `${params.vnetName}-natgw`,
      location: params.location,
      resourceGroupName: params.resourceGroupName,
      skuName: "Standard",
      idleTimeoutInMinutes: 10,
      tags: {
        Name: `${params.vnetName}-natgw`,
        ...(params.vnetTags || {}),
      },
    });

    new NatGatewayPublicIpAssociation(scope, "AzureNatGwIpAssoc", {
      provider,
      natGatewayId: natGateway.id,
      publicIpAddressId: natPublicIp.id,
    });

    Object.values(subnets).forEach((subnet, index) => {
      new SubnetNatGatewayAssociation(scope, `AzureNatAssoc-${index}`, {
        provider,
        subnetId: subnet.id,
        natGatewayId: natGateway.id,
      });
    });
  }

  // --- Bastion ---
  if (params.bastionenabled) {
    const bastionSubnet = new Subnet(scope, "AzureBastionSubnet", {
      provider,
      resourceGroupName: params.resourceGroupName,
      virtualNetworkName: vnet.name,
      name: "AzureBastionSubnet",
      addressPrefixes: [params.bastionSubnetcidr],
    });

    const bastionPublicIp = new PublicIp(scope, "AzureBastionPublicIp", {
      provider,
      name: `${params.vnetName}-bastion-pip`,
      location: params.location,
      resourceGroupName: params.resourceGroupName,
      allocationMethod: "Static",
      sku: "Standard",
      tags: {
        Name: `${params.vnetName}-bastion-pip`,
        ...(params.vnetTags || {}),
      },
    });

    new BastionHost(scope, "bastionHost", {
      provider,
      name: `${params.vnetName}-bastion`,
      location: params.location,
      resourceGroupName: params.resourceGroupName,
      ipConfiguration: {
        name: "bastionIpConfig",
        subnetId: bastionSubnet.id,
        publicIpAddressId: bastionPublicIp.id,
      },
      tags: {
        Name: `${params.vnetName}-bastion`,
        ...(params.vnetTags || {}),
      },
    });
  }

  return {
    vnet,
    nsgs,
    nsgRules,
    subnets,
    subnetAssociations,
    params,
  };
}
