import { LOCATION, RESOURCE_GROUP } from "./common";

export const azureDevOpsAcrConfigs = [
  {
    name: "mycompanyacr001",
    build: true,
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    sku: "Premium",
    subnetName: "private-endpoint-subnet",
    adminEnabled: true,
  },
];
