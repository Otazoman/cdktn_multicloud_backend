import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { StorageAccount } from "@cdktn/provider-azurerm/lib/storage-account";
import { StorageShare } from "@cdktn/provider-azurerm/lib/storage-share";
import { Construct } from "constructs";

/**
 * Azure Storage and File Share Configuration
 */
export interface AzureFilesConfig {
  accountName: string;
  resourceGroupName: string;
  location: string;
  shareName: string;
  quotaInGb?: number; // Default is 5120 GB (5TB) for standard
  tier?: "TransactionOptimized" | "Hot" | "Cool" | "Premium";
  replicationType?: "LRS" | "GRS" | "RAGRS" | "ZRS";
  accessTier?: "Hot" | "Cool";
  tags?: { [key: string]: string };
}

export function createAzureFilesResources(
  scope: Construct,
  provider: AzurermProvider,
  config: AzureFilesConfig,
) {
  // 1. Storage Account (Required to host File Shares)
  const storageAccount = new StorageAccount(scope, `st-${config.accountName}`, {
    provider,
    name: config.accountName,
    resourceGroupName: config.resourceGroupName,
    location: config.location,
    accountTier: config.tier === "Premium" ? "Premium" : "Standard",
    accountReplicationType: config.replicationType ?? "LRS",
    accessTier: config.accessTier ?? "Hot",

    // Security best practices
    minTlsVersion: "TLS1_2",
    httpsTrafficOnlyEnabled: true,
    allowNestedItemsToBePublic: false,

    tags: config.tags,
  });

  // 2. Azure File Share
  const fileShare = new StorageShare(scope, `share-${config.shareName}`, {
    provider,
    name: config.shareName,
    storageAccountId: storageAccount.id,
    quota: config.quotaInGb ?? 5120, // GB unit
    enabledProtocol: "SMB", // SMB is default for standard file shares

    // Ensures the share is only created after the account is ready
    dependsOn: [storageAccount],
  });

  return { storageAccount, fileShare };
}
