import { ContainerRegistry } from "@cdktn/provider-azurerm/lib/container-registry";
import { DnsZone } from "@cdktn/provider-azurerm/lib/dns-zone";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Construct } from "constructs";
import { AzureResourcesOutput, AzureVnetResources } from "./types";

/** Values shared between the Azure feature modules. */
export interface AzureBuildContext {
  scope: Construct;
  azureProvider: AzurermProvider;
  output: AzureResourcesOutput;
  azureVnetResources: AzureVnetResources;
  publicZones: Record<string, DnsZone>;
  acrRegistryMap: Map<string, ContainerRegistry>;
}
