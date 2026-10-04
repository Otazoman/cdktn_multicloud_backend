import { LOCATION, RESOURCE_GROUP } from "./common";

export const azureDevOpsAcrConfigs = [
  {
    name: "mycompanyacr001",
    // Private endpoint names (omitted: default name)
    names: {
      privateEndpoint: "pe-mycompanyacr001",
      privateServiceConnection: "psc-mycompanyacr001",
      privateDnsZoneGroup: "acr-dns-zone-group-mycompanyacr001",
      privateDnsZoneVnetLink: "acr-shared-vnet-link",
    },
    build: true,
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    sku: "Premium",
    subnetName: "private-endpoint-subnet",
    adminEnabled: true,
  },
];
