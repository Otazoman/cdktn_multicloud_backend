import { DataAzurermSubnet } from "@cdktf/provider-azurerm/lib/data-azurerm-subnet";
import { LinuxVirtualMachine } from "@cdktf/provider-azurerm/lib/linux-virtual-machine";
import { NetworkInterface } from "@cdktf/provider-azurerm/lib/network-interface";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { PrivateKey } from "@cdktf/provider-tls/lib/private-key";
import { Construct } from "constructs";

interface AzureVmConfig {
  name: string;
  resourceGroupName: string;
  location: string;
  size: string;
  adminUsername: string;
  osDisk: {
    caching: string;
    storageAccountType: string;
  };
  sourceImageReference: {
    publisher: string;
    offer: string;
    sku: string;
    version: string;
  };
}

interface CreateAzureVmParams {
  vnetName: string;
  subnetNames: { [key: string]: string };
  vmConfigs: AzureVmConfig[];
  sshKey: PrivateKey;
}

export function createAzureVms(
  scope: Construct,
  provider: AzurermProvider,
  params: CreateAzureVmParams
): LinuxVirtualMachine[] {
  const subnets = Object.entries(params.subnetNames).map(
    ([key, value]) =>
      new DataAzurermSubnet(scope, `subnet-${key}`, {
        name: value,
        virtualNetworkName: params.vnetName,
        resourceGroupName: params.vmConfigs[0].resourceGroupName,
        provider: provider,
      })
  );

  const vms: LinuxVirtualMachine[] = [];

  params.vmConfigs.forEach((vmConfig, index) => {
    const nic = new NetworkInterface(scope, `nic-${index}`, {
      name: `${vmConfig.name}-nic`,
      location: vmConfig.location,
      resourceGroupName: vmConfig.resourceGroupName,
      ipConfiguration: [
        {
          name: "internal",
          subnetId: subnets[index % subnets.length].id,
          privateIpAddressAllocation: "Dynamic",
        },
      ],
      provider: provider,
    });

    const vm = new LinuxVirtualMachine(scope, `vm-${index}`, {
      name: vmConfig.name,
      resourceGroupName: vmConfig.resourceGroupName,
      location: vmConfig.location,
      size: vmConfig.size,
      adminUsername: vmConfig.adminUsername,
      networkInterfaceIds: [nic.id],
      adminSshKey: [
        {
          username: vmConfig.adminUsername,
          publicKey: params.sshKey.publicKeyOpenssh,
        },
      ],
      osDisk: {
        caching: vmConfig.osDisk.caching,
        storageAccountType: vmConfig.osDisk.storageAccountType,
      },
      sourceImageReference: vmConfig.sourceImageReference,
      provider: provider,
    });

    vms.push(vm);
  });

  return vms;
}
