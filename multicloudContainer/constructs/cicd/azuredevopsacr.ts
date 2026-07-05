import { ContainerRegistry } from "@cdktn/provider-azurerm/lib/container-registry";
import { PrivateDnsZone } from "@cdktn/provider-azurerm/lib/private-dns-zone";
import { PrivateEndpoint } from "@cdktn/provider-azurerm/lib/private-endpoint";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";
import { Construct } from "constructs";
import { createSharedAcrPrivateDnsZone } from "../dns/privatezone/azureprivatezone";

export interface AzureDevOpsAcrConfig {
  name: string;
  build: boolean;
  resourceGroupName: string;
  location: string;
  sku: string;
  subnetName: string;
  adminEnabled: boolean;
}

export interface AzureDevOpsAcrOutput {
  registry: ContainerRegistry;
  privateEndpoint: PrivateEndpoint;
  privateDnsZone: PrivateDnsZone;
}

export function createAzureDevOpsAcrResources(
  scope: Construct,
  provider: AzurermProvider,
  config: AzureDevOpsAcrConfig & {
    subnetId: string;
    virtualNetwork: VirtualNetwork;
  },
  sharedDnsZone?: PrivateDnsZone,
): AzureDevOpsAcrOutput {
  // 1. Azure Container Registry
  const registry = new ContainerRegistry(scope, `acr-${config.name}`, {
    provider,
    name: config.name,
    resourceGroupName: config.resourceGroupName,
    location: config.location,
    sku: config.sku,
    adminEnabled: config.adminEnabled,
    publicNetworkAccessEnabled: false, // Block public access to enforce private communication
  });

  // 2. Private DNS Zone (Pass-the-baton pattern)
  let privateDnsZone = sharedDnsZone;

  if (!privateDnsZone) {
    // Call the shared function defined in step 1 if no existing zone is passed
    const sharedResources = createSharedAcrPrivateDnsZone(
      scope,
      provider,
      config.resourceGroupName,
      config.virtualNetwork,
    );
    privateDnsZone = sharedResources.privateDnsZone;
  }

  // 3. Private Endpoint with Automatic DNS Registration
  const privateEndpoint = new PrivateEndpoint(scope, `acr-pe-${config.name}`, {
    provider,
    name: `pe-${config.name}`,
    resourceGroupName: config.resourceGroupName,
    location: config.location,
    subnetId: config.subnetId,
    privateServiceConnection: {
      name: `psc-${config.name}`,
      privateConnectionResourceId: registry.id,
      subresourceNames: ["registry"],
      isManualConnection: false,
    },
    // Use privateDnsZoneGroup for auto-syncing all resolving IPs (Login + Data endpoints)
    privateDnsZoneGroup: {
      name: `acr-dns-zone-group-${config.name}`,
      privateDnsZoneIds: [privateDnsZone.id],
    },
  });

  return {
    registry,
    privateEndpoint,
    privateDnsZone,
  };
}
