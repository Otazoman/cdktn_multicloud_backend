import { LOCATION, RESOURCE_GROUP, VNET_NAME } from "../common";
import { nsgConfigs } from "./nsgRules";
import { bastionSubnetcidr, subnets } from "./subnets";

/* Virtual Network (VNet) configuration parameters */
export const azureVnetResourcesparams = {
  resourceGroupName: RESOURCE_GROUP,
  location: LOCATION,
  vnetName: VNET_NAME,
  isEnabled: true,
  vnetAddressSpace: "10.2.0.0/16",
  vnetTags: {
    Project: "MultiCloud",
  },
  subnets: subnets,
  natenabled: true,
  bastionenabled: false,
  bastionSubnetcidr: bastionSubnetcidr,
  nsgConfigs: nsgConfigs,
};
