import { envScopedName } from "../environment";
import { LOCATION, RESOURCE_GROUP } from "./common";

/**
 * Key Vault (FEAT-01). Created when clouds.azure.features.dbs is enabled.
 *
 * The vault is reachable only through its private endpoint, so cdktn creates
 * the vault and the access only, not the secrets. The secrets are created
 * from the Azure work VM with the Azure CLI (docs/operations.md, "Secrets").
 */
export const azureKeyVaultConfig = {
  /**
   * Globally unique, 3-24 characters (letters, digits, hyphens). Other
   * environments than dev get the environment name appended.
   */
  name: envScopedName("multicloud-kv-001"),
  resourceGroupName: RESOURCE_GROUP,
  location: LOCATION,
  skuName: "standard",
  /** Days a deleted vault / secret can be restored (7-90) */
  softDeleteRetentionDays: 7,
  /** When true, the vault cannot be purged until the retention ends */
  purgeProtectionEnabled: false,
  /** Subnet of the private endpoint (config/azure/vnet/subnets.ts) */
  subnetName: "private-endpoint-subnet",
  /**
   * Principals (object IDs of users / groups) allowed to read and write the
   * secrets (role "Key Vault Secrets Officer"). The identity that runs cdktn
   * is always added.
   */
  secretsOfficerPrincipalIds: [] as string[],
  // Names (omitted: <PROJECT_NAME>-azure-<kind>-<vault name>)
  names: {} as {
    privateEndpoint?: string;
    privateServiceConnection?: string;
    privateDnsZoneGroup?: string;
    privateDnsZoneVnetLink?: string;
  },
  /** Secrets created with the Azure CLI (names used by the procedure) */
  secretNames: ["db-api-password", "db-repl-password"],
};
