import { ContainerApp } from "@cdktn/provider-azurerm/lib/container-app";
import { ContainerRegistry } from "@cdktn/provider-azurerm/lib/container-registry";
import { DnsZone } from "@cdktn/provider-azurerm/lib/dns-zone";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { StorageAccount } from "@cdktn/provider-azurerm/lib/storage-account";
import { Construct } from "constructs";
import { AzureMonitorResources } from "../../constructs/observability/azuremonitor";
import { AzureResourcesOutput, AzureVnetResources } from "./types";

/** Values shared between the Azure feature modules. */
export interface AzureBuildContext {
  scope: Construct;
  azureProvider: AzurermProvider;
  output: AzureResourcesOutput;
  azureVnetResources: AzureVnetResources;
  publicZones: Record<string, DnsZone>;
  acrRegistryMap: Map<string, ContainerRegistry>;
  /** Container Apps by config name */
  containerApps: Map<string, ContainerApp>;
  /** Log Analytics Workspace and Action Groups (azureMonitorConfig.isEnabled) */
  azureMonitor?: AzureMonitorResources;
  /** Log archive storage account and archived environments (features.logArchive) */
  logArchive?: { storageAccount: StorageAccount; environments: string[] };
}
