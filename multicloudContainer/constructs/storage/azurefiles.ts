import { PrivateDnsZone } from "@cdktn/provider-azurerm/lib/private-dns-zone";
import { PrivateDnsZoneVirtualNetworkLink } from "@cdktn/provider-azurerm/lib/private-dns-zone-virtual-network-link";
import { PrivateEndpoint } from "@cdktn/provider-azurerm/lib/private-endpoint";
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
  /**
   * File share protocol.
   * - "SMB" (default): Windows and Linux, Standard or Premium tier.
   * - "NFS": Linux only. Requires Premium tier, LFS/ZRS replication,
   *          privateEndpointEnabled: true, and quotaInGb >= 100.
   */
  enabledProtocol?: "SMB" | "NFS";
  // Private Endpoint configuration
  privateEndpointEnabled?: boolean;
  subnetKey?: string; // Key matching subnets map (used externally to resolve subnetId)
  /**
   * Additional IP ranges allowed to access the storage account
   * (e.g. developer PCs, Azure Portal).
   * When privateEndpointEnabled is true, the default network action is Deny.
   * Adding IPs here allows those addresses through the firewall while keeping
   * all other public access blocked.
   * AzureServices (Azure Portal, metrics, diagnostics) are always bypassed.
   */
  allowedIpRanges?: string[];
}

export interface AzureFilesPrivateOptions {
  /** Subnet ID where the Private Endpoint will be placed */
  subnetId: string;
  /** VNet ID to link the privatelink DNS zone */
  virtualNetworkId: string;
  /**
   * Shared privatelink.file.core.windows.net DNS zone.
   * Pass the zone created by the first storage account so subsequent accounts
   * reuse the same zone (Azure allows only one zone per subscription).
   */
  sharedPrivateDnsZone?: PrivateDnsZone;
}

export interface AzureFilesOutput {
  storageAccount: StorageAccount;
  fileShare: StorageShare;
  privateEndpoint?: PrivateEndpoint;
  /**
   * The privatelink.file.core.windows.net Private DNS Zone.
   * Created by the first storage account; returned so callers can pass it
   * to subsequent accounts via sharedPrivateDnsZone.
   */
  privateDnsZone?: PrivateDnsZone;
  privateDnsZoneVnetLink?: PrivateDnsZoneVirtualNetworkLink;
}

export function createAzureFilesResources(
  scope: Construct,
  provider: AzurermProvider,
  config: AzureFilesConfig,
  privateOptions?: AzureFilesPrivateOptions,
): AzureFilesOutput {
  // Determine if NFS protocol is requested
  // NFS requires: Premium tier, FileStorage account kind, httpsTrafficOnlyEnabled: false
  const isNfs = config.enabledProtocol === "NFS";

  // 1. Storage Account (Required to host File Shares)
  const storageAccount = new StorageAccount(scope, `st-${config.accountName}`, {
    provider,
    name: config.accountName,
    resourceGroupName: config.resourceGroupName,
    location: config.location,
    // NFS mandates Premium tier and FileStorage account kind
    accountTier: isNfs
      ? "Premium"
      : config.tier === "Premium"
      ? "Premium"
      : "Standard",
    accountKind: isNfs ? "FileStorage" : undefined,
    accountReplicationType: config.replicationType ?? "LRS",
    accessTier: isNfs ? undefined : config.accessTier ?? "Hot",

    // Security best practices
    minTlsVersion: "TLS1_2",
    // NFS protocol does not support HTTPS — must be disabled for NFS shares
    httpsTrafficOnlyEnabled: isNfs ? false : true,
    allowNestedItemsToBePublic: false,

    // publicNetworkAccessEnabled controls whether the public internet route is open.
    // - NFS always requires Private Endpoint; public access must be disabled.
    //   Cross-cloud VPN traffic (AWS/GCP) reaches NFS via Private Endpoint which
    //   bypasses StorageAccount firewall rules entirely — no public access needed.
    // - SMB + privateEndpointEnabled + allowedIpRanges: enable public route so that
    //   specified IPs (e.g. developer PC, Azure Portal) can reach via networkRules.
    // - SMB + privateEndpointEnabled + no allowedIpRanges: disable public access.
    publicNetworkAccessEnabled: isNfs
      ? false // NFS is always Private Endpoint only; public access disabled
      : config.privateEndpointEnabled
      ? config.allowedIpRanges && config.allowedIpRanges.length > 0
        ? true // open public route but restrict via networkRules ipRules
        : false // no allowed IPs → block all public access
      : true,

    // Network rules: applied when Private Endpoint is enabled.
    // defaultAction "Deny" blocks all public traffic except:
    //   - Private Endpoint (VNet internal) — always allowed
    //   - Explicit IP rules from allowedIpRanges — allows specified developer/admin IPs
    //     (enables Azure Portal storage browser access from those IPs)
    networkRules:
      config.privateEndpointEnabled || isNfs
        ? {
            defaultAction: "Deny",
            bypass: ["AzureServices"],
            // ipRules expects string[] (CIDR or IP notation)
            ipRules:
              config.allowedIpRanges && config.allowedIpRanges.length > 0
                ? config.allowedIpRanges
                : [],
          }
        : undefined,

    tags: config.tags,
  });

  // 2. Azure File Share
  const fileShare = new StorageShare(scope, `share-${config.shareName}`, {
    provider,
    name: config.shareName,
    storageAccountId: storageAccount.id,
    // NFS: quota >= 100 GB required; SMB: default 5120 GB
    quota: config.quotaInGb ?? (isNfs ? 100 : 5120),
    // Use configured protocol, defaulting to SMB
    enabledProtocol: config.enabledProtocol ?? "SMB",

    // Ensures the share is only created after the account is ready
    dependsOn: [storageAccount],
  });

  const output: AzureFilesOutput = { storageAccount, fileShare };

  // 3. Private Endpoint and Private DNS Zone (only when privateEndpointEnabled)
  if (config.privateEndpointEnabled && privateOptions) {
    const { subnetId, virtualNetworkId, sharedPrivateDnsZone } = privateOptions;

    // 3a. privatelink.file.core.windows.net DNS Zone
    // Created only for the first storage account; subsequent accounts reuse the shared zone.
    let privateDnsZone: PrivateDnsZone;
    let privateDnsZoneVnetLink: PrivateDnsZoneVirtualNetworkLink | undefined;

    if (sharedPrivateDnsZone) {
      // Reuse existing zone (2nd+ storage account)
      privateDnsZone = sharedPrivateDnsZone;
    } else {
      // Create zone for the first storage account
      privateDnsZone = new PrivateDnsZone(
        scope,
        "azure-files-privatelink-dns-zone",
        {
          provider,
          name: "privatelink.file.core.windows.net",
          resourceGroupName: config.resourceGroupName,
          tags: config.tags,
        },
      );

      // Link the Private DNS Zone to the VNet
      privateDnsZoneVnetLink = new PrivateDnsZoneVirtualNetworkLink(
        scope,
        "azure-files-privatelink-dns-vnet-link",
        {
          provider,
          name: "files-privatelink-vnet-link",
          resourceGroupName: config.resourceGroupName,
          privateDnsZoneName: privateDnsZone.name,
          virtualNetworkId: virtualNetworkId,
          registrationEnabled: false,
          dependsOn: [privateDnsZone],
        },
      );

      output.privateDnsZone = privateDnsZone;
      output.privateDnsZoneVnetLink = privateDnsZoneVnetLink;
    }

    // 3b. Private Endpoint (one per storage account)
    const privateEndpoint = new PrivateEndpoint(
      scope,
      `pe-${config.accountName}`,
      {
        provider,
        name: `pe-${config.accountName}`,
        resourceGroupName: config.resourceGroupName,
        location: config.location,
        subnetId: subnetId,
        privateServiceConnection: {
          name: `psc-${config.accountName}`,
          privateConnectionResourceId: storageAccount.id,
          subresourceNames: ["file"],
          isManualConnection: false,
        },
        // Automatically register the Private Endpoint IP in the private DNS zone
        privateDnsZoneGroup: {
          name: `pe-dns-group-${config.accountName}`,
          privateDnsZoneIds: [privateDnsZone.id],
        },
        tags: config.tags,
        dependsOn: [storageAccount, privateDnsZone],
      },
    );

    output.privateEndpoint = privateEndpoint;
  }

  return output;
}
