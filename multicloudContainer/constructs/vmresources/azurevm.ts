import { LinuxVirtualMachine } from "@cdktn/provider-azurerm/lib/linux-virtual-machine";
import { NetworkInterface } from "@cdktn/provider-azurerm/lib/network-interface";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Construct } from "constructs";
import * as fs from "fs";

interface AzureVmConfig {
  name: string;
  resourceGroupName: string;
  location: string;
  size: string;
  adminUsername: string;
  publicKeyPath: string;
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
  vmInitScriptPath?: string;
}

interface CreateAzureVmParams {
  vnetName: string;
  subnets: Record<string, { id: string; name: string }>;
  vmConfigs: AzureVmConfig[];
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

    // Startup script
    let encodedCustomData: string | undefined = undefined;

    if (vmConfig.vmInitScriptPath) {
      try {
        const vmInitScript = fs.readFileSync(
          vmConfig.vmInitScriptPath,
          "utf-8"
        );
        encodedCustomData = Buffer.from(vmInitScript).toString("base64");
      } catch (error) {
        console.error(
          `Error reading VM init script at ${vmConfig.vmInitScriptPath!}:`,
          error
        );
        throw new Error(
          `Failed to read VM initialization script from path: ${vmConfig.vmInitScriptPath}. Please check if the file exists and is accessible.`
        );
      }
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
          publicKey: fs.readFileSync(vmConfig.publicKeyPath, "utf-8"),
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
      customData: encodedCustomData,
    });
    vms.push(vm);
  }
  return vms;
}
