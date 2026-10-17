import { ContainerAppJob } from "@cdktn/provider-azurerm/lib/container-app-job";
import { KeyVault } from "@cdktn/provider-azurerm/lib/key-vault";
import { Providers } from "../../providers/providers";
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
  providers: Providers;
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
  /** Key Vault of the database secrets (config/azure/secrets.ts), set by the dbs feature */
  keyVault?: KeyVault;
  /** Journal pruning jobs by the Container App whose image they run, set by the containers feature */
  journalPruneJobs: Map<string, ContainerAppJob>;
}
