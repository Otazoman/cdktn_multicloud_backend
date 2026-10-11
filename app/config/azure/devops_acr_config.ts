import { envScopedName } from "../environment";
import { LOCATION, RESOURCE_GROUP } from "./common";

export const azureDevOpsAcrConfigs = [
  {
    // Globally unique; other environments than dev get the environment name appended
    name: envScopedName("mycompanyacr001", { hyphen: false }),
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
