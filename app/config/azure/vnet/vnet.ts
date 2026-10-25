import { LOCATION, RESOURCE_GROUP, VNET_NAME } from "../common";
import { nsgConfigs } from "./nsgRules";
import { bastionSubnetcidr, subnets } from "./subnets";

/* Virtual Network (VNet) configuration parameters */
export const azureVnetResourcesparams = {
  resourceGroupName: RESOURCE_GROUP,
  location: LOCATION,
  vnetName: VNET_NAME,
  vnetAddressSpace: "10.2.0.0/16",
  vnetTags: {
    Project: "MultiCloud",
  },
  subnets: subnets,
  natenabled: true,
  natPublicIpName: "my-azure-vnet-nat-pip",
  natGatewayName: "my-azure-vnet-natgw",
  bastionenabled: false,
  bastionPublicIpName: "my-azure-vnet-bastion-pip",
  bastionHostName: "my-azure-vnet-bastion",
  bastionIpConfigurationName: "bastionIpConfig",
  bastionSubnetcidr: bastionSubnetcidr,
  nsgConfigs: nsgConfigs,
};
