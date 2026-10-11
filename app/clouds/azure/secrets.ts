import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";
import { azureKeyVaultConfig } from "../../config/azure/azuresettings";
import { isFeatureEnabled } from "../../config/features";
import { createAzureKeyVault } from "../../constructs/secrets/azurekeyvault";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { AzureBuildContext } from "./context";

/** 4.5. Key Vault for the database secrets (feature: dbs) */
export function createAzureSecretResources(ctx: AzureBuildContext): void {
  const { scope, azureProvider, azureVnetResources } = ctx;
  if (!isFeatureEnabled("azure", "dbs")) {
    return;
  }

  const subnet = azureVnetResources.subnets[azureKeyVaultConfig.subnetName];
  if (!subnet) {
    throw new Error(
      `Subnet ${azureKeyVaultConfig.subnetName} not found for Key Vault ${azureKeyVaultConfig.name}`,
    );
  }

  const { privateEndpoint } = createAzureKeyVault(scope, azureProvider, {
    ...azureKeyVaultConfig,
    subnetId: subnet.id,
    virtualNetwork: azureVnetResources.vnet as VirtualNetwork,
  });
  addTerraformDependency(privateEndpoint, subnet);
}
