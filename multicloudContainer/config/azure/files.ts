import { LOCATION, RESOURCE_GROUP } from "./common";

export const azureFilesConfigs = [
  {
    build: true,
    accountName: "stcatappdata001",
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    shareName: "app-shared1-files-20260223",
    // File share protocol: "SMB" (default, Windows/Linux) or "NFS" (Linux only)
    // NFS requirements: tier must be "Premium", replicationType "LRS" or "ZRS",
    //                   privateEndpointEnabled must be true (NFS requires VNet integration),
    //                   quotaInGb must be >= 100
    enabledProtocol: "NFS" as "SMB" | "NFS",
    quotaInGb: 100,
    tier: "Premium" as "TransactionOptimized" | "Hot" | "Cool" | "Premium",
    replicationType: "LRS" as "LRS" | "GRS" | "RAGRS" | "ZRS",
    tags: {
      Department: "IT",
    },
    // Private Endpoint configuration (subnet within VNet for private access)
    privateEndpointEnabled: true,
    subnetKey: "storage-subnet", // Key matching subnets.ts
    // Allowed IP ranges for Azure Portal / Storage Explorer access (in addition to Private Endpoint).
    // These IPs bypass the network firewall (defaultAction: Deny).
    // Leave empty [] to restrict access to Private Endpoint only.
    // Example: ["150.9.100.236"] to allow a specific developer IP
    allowedIpRanges: ["150.9.100.236"] as string[],
    // DNS CNAME record name registered in azure.inner private zone
    cnameRecordName: "files-shared1",
  },
  {
    build: false,
    accountName: "stcatappdata002",
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    shareName: "app-shared2-files-20260223",
    // File share protocol: "SMB" (default, Windows/Linux) or "NFS" (Linux only)
    // NFS requirements: tier must be "Premium", replicationType "LRS" or "ZRS",
    //                   privateEndpointEnabled must be true (NFS requires VNet integration),
    //                   quotaInGb must be >= 100
    enabledProtocol: "SMB" as "SMB" | "NFS",
    quotaInGb: 10,
    tier: "Hot" as "TransactionOptimized" | "Hot" | "Cool" | "Premium",
    replicationType: "LRS" as "LRS" | "GRS" | "RAGRS" | "ZRS",
    tags: {
      Department: "DEV",
    },
    // Private Endpoint configuration (subnet within VNet for private access)
    privateEndpointEnabled: true,
    subnetKey: "storage-subnet", // Key matching subnets.ts
    // Allowed IP ranges for Azure Portal / Storage Explorer access (in addition to Private Endpoint).
    // These IPs bypass the network firewall (defaultAction: Deny).
    // Leave empty [] to restrict access to Private Endpoint only.
    // Example: ["150.9.100.236"] to allow a specific developer IP
    allowedIpRanges: [] as string[],
    // DNS CNAME record name registered in azure.inner private zone
    cnameRecordName: "files-shared2",
  },
];
