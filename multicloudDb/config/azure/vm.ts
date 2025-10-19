import { LOCATION, RESOURCE_GROUP } from './common';

/* Azure Virtual Machine (VM) configurations */
export const azureVmsConfigparams = [
  {
    name: "example-vm-1",
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    size: "Standard_B1ls",
    adminUsername: "azureuser",
    osDisk: {
      caching: "ReadWrite",
      storageAccountType: "Standard_LRS",
      diskSizeGb: 30,
    },
    sourceImageReference: {
      publisher: "Canonical",
      offer: "ubuntu-24_04-lts",
      sku: "server",
      version: "latest",
    },
    subnetKey: "subnet1",
    tags: {
      Name: "MyAzureVM1",
      Owner: "Team-A",
    },
    build: false,
  },
  {
    name: "example-vm-2",
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    size: "Standard_B1ls",
    adminUsername: "azureuser",
    osDisk: {
      caching: "ReadWrite",
      storageAccountType: "Standard_LRS",
      diskSizeGb: 30,
    },
    sourceImageReference: {
      publisher: "Canonical",
      offer: "ubuntu-24_04-lts",
      sku: "server",
      version: "latest",
    },
    subnetKey: "subnet2",
    tags: {
      Name: "MyAzureVM2",
      Owner: "Team-B",
    },
    build: false,
  },
];