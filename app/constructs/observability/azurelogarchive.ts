import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { StorageAccount } from "@cdktn/provider-azurerm/lib/storage-account";
import { StorageManagementPolicy } from "@cdktn/provider-azurerm/lib/storage-management-policy";
import { Construct } from "constructs";

export interface AzureLogArchiveParams {
  resourceGroupName: string;
  location: string;
  storageAccountName: string;
  /** "LRS" / "GRS" / ... (the archive tier is not available with ZRS) */
  replication: string;
  /**
   * Encrypt the data a second time at the infrastructure level. Can only be
   * set when the account is created (changing it replaces the account).
   */
  infrastructureEncryption?: boolean;
  /** false sets prevent_destroy: destroy fails instead of deleting the archive */
  deleteOnDestroy: boolean;
  lifecycle?: { toCoolDays?: number; toArchiveDays?: number; deleteDays?: number };
  tags?: { [key: string]: string };
}

/**
 * Storage account that diagnostic settings archive logs to (containers
 * "insights-logs-<category>", hourly blobs), with a lifecycle policy.
 */
export function createAzureLogArchive(
  scope: Construct,
  provider: AzurermProvider,
  params: AzureLogArchiveParams,
) {
  const storageAccount = new StorageAccount(scope, "azure-log-archive-storage", {
    provider,
    name: params.storageAccountName,
    resourceGroupName: params.resourceGroupName,
    location: params.location,
    accountKind: "StorageV2",
    accountTier: "Standard",
    accountReplicationType: params.replication,
    httpsTrafficOnlyEnabled: true,
    minTlsVersion: "TLS1_2",
    infrastructureEncryptionEnabled: params.infrastructureEncryption,
    allowNestedItemsToBePublic: false,
    tags: params.tags,
  });
  if (!params.deleteOnDestroy) {
    storageAccount.addOverride("lifecycle", { prevent_destroy: true });
  }

  const { toCoolDays, toArchiveDays, deleteDays } = params.lifecycle ?? {};
  if (toCoolDays || toArchiveDays || deleteDays) {
    new StorageManagementPolicy(scope, "azure-log-archive-storage-lifecycle", {
      provider,
      storageAccountId: storageAccount.id,
      rule: [
        {
          name: "archive",
          enabled: true,
          filters: { blobTypes: ["blockBlob"], prefixMatch: ["insights-logs-"] },
          actions: {
            baseBlob: {
              tierToCoolAfterDaysSinceModificationGreaterThan: toCoolDays,
              tierToArchiveAfterDaysSinceModificationGreaterThan: toArchiveDays,
              deleteAfterDaysSinceModificationGreaterThan: deleteDays,
            },
          },
        },
      ],
    });
  }

  return { storageAccount };
}
