import { NetworkSecurityGroup } from '@cdktf/provider-azurerm/lib/network-security-group';
import { NetworkSecurityRule } from '@cdktf/provider-azurerm/lib/network-security-rule';
import { AzurermProvider } from '@cdktf/provider-azurerm/lib/provider';
import { Subnet } from '@cdktf/provider-azurerm/lib/subnet';
import { SubnetNetworkSecurityGroupAssociation } from '@cdktf/provider-azurerm/lib/subnet-network-security-group-association';
import { VirtualNetwork } from '@cdktf/provider-azurerm/lib/virtual-network';
import { Construct } from 'constructs';

interface SubnetConfig {
  name: string;
  cidr: string;
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

interface AzureResourcesParams {
  resourceGroupName: string;
  location: string;
  vnetName: string;
  vnetAddressSpace: string;
  subnets: SubnetConfig[];
  nsgRules: NSGRuleConfig[];
}

export function createAzureVnetResources(scope: Construct, provider: AzurermProvider, params: AzureResourcesParams) {
    // vnet
    const vnet = new VirtualNetwork(scope, 'azureVnet', {
        provider: provider,
        name: params.vnetName,
        addressSpace: [params.vnetAddressSpace],
        location: params.location,
        resourceGroupName: params.resourceGroupName,
    });

    // nsg
    const nsg = new NetworkSecurityGroup(scope, 'multicloudVpnNsg', {
        provider: provider,
        resourceGroupName: params.resourceGroupName,
        location: params.location,
        name: `${params.vnetName}-nsg`,
    });
    
    // subnets
    const subnets: { [key: string]: Subnet } = {};
    params.subnets.forEach((subnet: SubnetConfig) => {
        const subnetResource = new Subnet(scope, `myAzureSubnet-${subnet.name}`, {
            provider: provider,
            resourceGroupName: params.resourceGroupName,
            virtualNetworkName: vnet.name,
            name: `${params.vnetName}-${subnet.name}`,
            addressPrefixes: [subnet.cidr],
        });
        new SubnetNetworkSecurityGroupAssociation(scope, `nsgAssociation-${subnet.name}`, {
            provider: provider,
            subnetId: subnetResource.id,
            networkSecurityGroupId: nsg.id,
        });
        subnets[subnet.name] = subnetResource;
    });

    // nsg rule
    const nsgs: { [key: string]: NetworkSecurityRule } = {};
    params.nsgRules.forEach((rule: NSGRuleConfig) => {
        new NetworkSecurityRule(scope, `nsgRule-${rule.name}`, {
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
        });
    });

    return { vnet, nsg, nsgs, subnets };
}