import { LOCATION, RESOURCE_GROUP } from "./common";

export const azureAcaConfigs = [
  {
    name: "frontend-service",
    build: false,
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    environmentName: "public-main-env",
    // Private DNS zone VNet link name (internal environments)
    privateDnsVnetLinkName: "aca-vnet-link",
    image: "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest",
    cpu: 0.25,
    memory: "0.5Gi",
    targetPort: 80,
    internal: false,
    externalEnabled: true,
    subnetName: "",
    env: [{ name: "APP_MODE", value: "prod" }],
  },
  {
    name: "backend-api-service",
    build: true,
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    environmentName: "main-env",
    // Private DNS zone VNet link name (internal environments)
    privateDnsVnetLinkName: "aca-vnet-link",
    image: "nginx:latest",
    cpu: 0.25,
    memory: "0.5Gi",
    targetPort: 80,
    internal: true,
    externalEnabled: true,
    subnetName: "aca-subnet",
    env: [{ name: "DB_URL", value: "flexible-db.mysql.database.azure.com" }],
    cnameRecordName: "api-backend",
    appGwBackendName: "http-backend-pool",
  },
];
