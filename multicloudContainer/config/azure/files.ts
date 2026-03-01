import { LOCATION, RESOURCE_GROUP } from "./common";

export const azureFilesConfigs = [
  {
    build: false,
    accountName: "stcatappdata001",
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    shareName: "app-shared1-files-20260223",
    quotaInGb: 10,
    tier: "Hot" as "TransactionOptimized" | "Hot" | "Cool" | "Premium",
    replicationType: "LRS" as "LRS" | "GRS" | "RAGRS" | "ZRS",
    tags: {
      Department: "IT",
    },
  },
  {
    build: false,
    accountName: "stcatappdata002",
    resourceGroupName: RESOURCE_GROUP,
    location: LOCATION,
    shareName: "app-shared2-files-20260223",
    quotaInGb: 10,
    tier: "Hot" as "TransactionOptimized" | "Hot" | "Cool" | "Premium",
    replicationType: "LRS" as "LRS" | "GRS" | "RAGRS" | "ZRS",
    tags: {
      Department: "DEV",
    },
  },
];
