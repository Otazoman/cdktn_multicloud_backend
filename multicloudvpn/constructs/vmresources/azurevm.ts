import { LinuxVirtualMachine } from "@cdktn/provider-azurerm/lib/linux-virtual-machine";
import { NetworkInterface } from "@cdktn/provider-azurerm/lib/network-interface";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { PrivateKey } from "@cdktn/provider-tls/lib/private-key";
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
    diskSizeGb?: number;
  };
  sourceImageReference: {
    publisher: string;
    offer: string;
    sku: string;
    version: string;
  };
  subnetKey: string;
  build: boolean;
  tags?: { [key: string]: string };
}

interface CreateAzureVmParams {
  vnetName: string;
  subnets: Record<string, { id: string; name: string }>;
  vmConfigs: AzureVmConfig[];
  sshKey: PrivateKey;
}

export function createAzureVms(
  scope: Construct,
  provider: AzurermProvider,
  params: CreateAzureVmParams
): LinuxVirtualMachine[] {
  const vms: LinuxVirtualMachine[] = [];

  // for rate limit
  for (const [index, vmConfig] of params.vmConfigs
    .filter((vmConfig) => vmConfig.build)
    .entries()) {
    const targetSubnet = params.subnets[vmConfig.subnetKey];
    if (!targetSubnet) {
      throw new Error(
        `Subnet with key ${vmConfig.subnetKey} not found for VM ${vmConfig.name}`
      );
    }

    const nic = new NetworkInterface(scope, `nic-${index}`, {
      name: `${vmConfig.name}-nic`,
      location: vmConfig.location,
      resourceGroupName: vmConfig.resourceGroupName,
      ipConfiguration: [
        {
          name: "internal",
          subnetId: targetSubnet.id,
          privateIpAddressAllocation: "Dynamic",
        },
      ],
      tags: vmConfig.tags,
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
        diskSizeGb: vmConfig.osDisk.diskSizeGb,
      },
      sourceImageReference: vmConfig.sourceImageReference,
      tags: vmConfig.tags,
      provider: provider,
    });
    vms.push(vm);
  }
  return vms;
}
