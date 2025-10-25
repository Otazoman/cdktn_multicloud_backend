import { LOCATION, RESOURCE_GROUP, VNET_NAME } from '../common';
import { nsgRules, nsgTags } from './nsgRules';
import { bastionSubnetcidr, subnets } from './subnets';

/* Virtual Network (VNet) configuration parameters */
export const azureVnetResourcesparams = {
  isEnabled: false,
  resourceGroupName: RESOURCE_GROUP,
  location: LOCATION,
  vnetName: VNET_NAME,
  vnetAddressSpace: "10.2.0.0/16",
  vnetTags: {
    Project: "MultiCloud",
  },

  subnets: subnets,

  natenabled: true,

  bastionenabled: true,
  bastionSubnetcidr: bastionSubnetcidr,
   
  nsgTags: nsgTags,
  nsgRules: nsgRules,
};