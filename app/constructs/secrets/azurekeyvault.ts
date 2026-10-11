import { DataAzurermClientConfig } from "@cdktn/provider-azurerm/lib/data-azurerm-client-config";
import { KeyVault } from "@cdktn/provider-azurerm/lib/key-vault";
import { PrivateDnsZone } from "@cdktn/provider-azurerm/lib/private-dns-zone";
import { PrivateDnsZoneVirtualNetworkLink } from "@cdktn/provider-azurerm/lib/private-dns-zone-virtual-network-link";
import { PrivateEndpoint } from "@cdktn/provider-azurerm/lib/private-endpoint";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { RoleAssignment } from "@cdktn/provider-azurerm/lib/role-assignment";
import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";
import { Construct } from "constructs";
import { resourceName } from "../../utils/naming";

export interface AzureKeyVaultConfig {
  name: string;
  resourceGroupName: string;
  location: string;
  skuName: string;
  softDeleteRetentionDays: number;
  purgeProtectionEnabled: boolean;
  /** Principals given "Key Vault Secrets Officer" (the cdktn identity is added) */
  secretsOfficerPrincipalIds: string[];
  names?: {
    privateEndpoint?: string;
    privateServiceConnection?: string;
    privateDnsZoneGroup?: string;
    privateDnsZoneVnetLink?: string;
  };
}

export interface AzureKeyVaultOutput {
  keyVault: KeyVault;
  privateEndpoint: PrivateEndpoint;
}

/**
 * Creates a Key Vault (RBAC, no public network access) with a private
 * endpoint and its private DNS zone. Secrets are not created here: the data
 * plane is reachable only from the VNet.
 */
export function createAzureKeyVault(
  scope: Construct,
  provider: AzurermProvider,
  config: AzureKeyVaultConfig & {
    subnetId: string;
    virtualNetwork: VirtualNetwork;
  },
): AzureKeyVaultOutput {
  const client = new DataAzurermClientConfig(scope, "azure-keyvault-client-config", {
    provider,
  });

  const keyVault = new KeyVault(scope, `azure-keyvault-${config.name}`, {
    provider,
    name: config.name,
    resourceGroupName: config.resourceGroupName,
    location: config.location,
    tenantId: client.tenantId,
    skuName: config.skuName,
    rbacAuthorizationEnabled: true,
    publicNetworkAccessEnabled: false,
    softDeleteRetentionDays: config.softDeleteRetentionDays,
    purgeProtectionEnabled: config.purgeProtectionEnabled,
  });

  // Read / write the secrets: the identity that runs cdktn and the
  // configured principals
  const principalIds = [
    { key: "cdktn", id: client.objectId },
    ...config.secretsOfficerPrincipalIds.map((id) => ({ key: id, id })),
  ];
  for (const principal of principalIds) {
    new RoleAssignment(scope, `azure-keyvault-secrets-officer-${principal.key}`, {
      provider,
      scope: keyVault.id,
      roleDefinitionName: "Key Vault Secrets Officer",
      principalId: principal.id,
    });
  }

  const privateDnsZone = new PrivateDnsZone(scope, "azure-keyvault-private-dns-zone", {
    provider,
    name: "privatelink.vaultcore.azure.net",
    resourceGroupName: config.resourceGroupName,
  });
  new PrivateDnsZoneVirtualNetworkLink(scope, "azure-keyvault-private-dns-vnet-link", {
    provider,
    name: resourceName(
      config.names?.privateDnsZoneVnetLink,
      "azure",
      "keyvault-vnet-link",
    ),
    privateDnsZoneId: privateDnsZone.id,
    virtualNetworkId: config.virtualNetwork.id,
    registrationEnabled: false,
  });

  const privateEndpoint = new PrivateEndpoint(
    scope,
    `azure-keyvault-pe-${config.name}`,
    {
      provider,
      name: resourceName(
        config.names?.privateEndpoint,
        "azure",
        "private-endpoint",
        config.name,
      ),
      resourceGroupName: config.resourceGroupName,
      location: config.location,
      subnetId: config.subnetId,
      privateServiceConnection: {
        name: resourceName(
          config.names?.privateServiceConnection,
          "azure",
          "private-service-connection",
          config.name,
        ),
        privateConnectionResourceId: keyVault.id,
        subresourceNames: ["vault"],
        isManualConnection: false,
      },
      privateDnsZoneGroup: {
        name: resourceName(
          config.names?.privateDnsZoneGroup,
          "azure",
          "private-dns-zone-group",
          config.name,
        ),
        privateDnsZoneIds: [privateDnsZone.id],
      },
    },
  );

  return { keyVault, privateEndpoint };
}
