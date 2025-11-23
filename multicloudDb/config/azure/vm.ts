import { LOCATION, RESOURCE_GROUP } from "./common";

/* Azure Virtual Machine (VM) configurations */
export const azureVmsConfigparams = [
  {
    build: false,
    name: "example-vm-1",
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    size: "Standard_B1ls",
    adminUsername: "azureuser",
    publicKeyPath: "pubkey/azurevmauthkey.pub",
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
    subnetKey: "app-subnet",
    tags: {
      Name: "MyAzureVM1",
      Owner: "Team-A",
    },
    vmInitScriptPath: "./scripts/vm_init.sh",
  },
  {
    build: false,
    name: "example-vm-2",
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    size: "Standard_B1ls",
    adminUsername: "azureuser",
    publicKeyPath: "pubkey/azurevmauthkey.pub",
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
    subnetKey: "app-subnet",
    tags: {
      Name: "MyAzureVM2",
      Owner: "Team-B",
    },
  },
];
