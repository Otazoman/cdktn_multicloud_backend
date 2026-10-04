import { azureVmsConfigparams } from "../../config/azure/azuresettings";
import { isFeatureEnabled } from "../../config/features";
import { createAzureVms } from "../../constructs/vmresources/azurevm";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { AzureBuildContext } from "./context";

/** 5. Azure VM (feature: vms) */
export function createAzureVmResources(ctx: AzureBuildContext): void {
  const { scope, azureProvider, azureVnetResources } = ctx;

  // ──────────────────────────────────────────────
  // 5. Azure VM
  // ──────────────────────────────────────────────
  if (isFeatureEnabled("azure", "vms")) {
    const azureVmParams = {
      vnetName: azureVnetResources.vnet.name,
      subnets: azureVnetResources.subnets,
      vmConfigs: azureVmsConfigparams,
    };
    const azureVms = createAzureVms(scope, azureProvider, azureVmParams);
    azureVms.forEach((vm) =>
      addTerraformDependency(vm, azureVnetResources.subnets),
    );
  }

}
