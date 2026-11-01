import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";
import { azureAppGwConfigs, azureKeyVaultConfig } from "../../config/azure/azuresettings";
import { isFeatureEnabled } from "../../config/features";
import { createAzureKeyVault } from "../../constructs/secrets/azurekeyvault";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { AzureBuildContext } from "./context";

/**
 * Application Gateways built with Let's Encrypt certificates (features.
 * containers): their certificates are kept in the Key Vault
 */
const appGwNeedsKeyVault = (): boolean =>
  isFeatureEnabled("azure", "containers") &&
  azureAppGwConfigs.some(
    (gw) => gw.build && (gw.sslCertificates ?? []).some((c) => c.mode === "LETS_ENCRYPT"),
  );

/**
 * 4.5. Key Vault for the database secrets (feature: dbs) and the Let's
 * Encrypt certificates of the Application Gateway (feature: containers)
 */
export function createAzureSecretResources(ctx: AzureBuildContext): void {
  const { scope, azureProvider, azureVnetResources } = ctx;
  if (!isFeatureEnabled("azure", "dbs") && !appGwNeedsKeyVault()) {
    return;
  }

  const subnet = azureVnetResources.subnets[azureKeyVaultConfig.subnetName];
  if (!subnet) {
    throw new Error(
      `Subnet ${azureKeyVaultConfig.subnetName} not found for Key Vault ${azureKeyVaultConfig.name}`,
    );
  }

  const { keyVault, privateEndpoint, privateDnsZoneVnetLink } = createAzureKeyVault(scope, azureProvider, {
    ...azureKeyVaultConfig,
    subnetId: subnet.id,
    virtualNetwork: azureVnetResources.vnet as VirtualNetwork,
  });
  addTerraformDependency(privateEndpoint, subnet);
  ctx.keyVault = keyVault;
  ctx.keyVaultPrivateAccess = [privateEndpoint, privateDnsZoneVnetLink];
}
