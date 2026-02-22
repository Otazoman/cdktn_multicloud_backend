export const azureAcaConfigs = [
  {
    name: "worker-service",
    build: true,
    resourceGroupName: "rg_multicloud",
    location: "Japan East",
    environmentName: "main-env",
    image: "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest",
    cpu: 0.25,
    memory: "0.5Gi",
    targetPort: 80,
    externalEnabled: true,
  },
];
