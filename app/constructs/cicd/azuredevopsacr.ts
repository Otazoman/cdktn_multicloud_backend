import { ContainerRegistry } from "@cdktn/provider-azurerm/lib/container-registry";
import { PrivateDnsZone } from "@cdktn/provider-azurerm/lib/private-dns-zone";
import { PrivateEndpoint } from "@cdktn/provider-azurerm/lib/private-endpoint";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";
import { Construct } from "constructs";
import { resourceName } from "../../utils/naming";
import { createSharedAcrPrivateDnsZone } from "../dns/privatezone/azureprivatezone";

export interface AzureDevOpsAcrConfig {
  /**
   * Construct ID key (Terraform address). Defaults to `name`. To rename
   * the resource without replacing it in state, set this to the old value.
   */
  key?: string;
  name: string;
  build: boolean;
  resourceGroupName: string;
  location: string;
  sku: string;
  subnetName: string;
  adminEnabled: boolean;
  /**
   * Private endpoint resource / sub-resource names.
   * Default: <project>-azure-<kind>-<registry>
   */
  names?: {
    privateEndpoint?: string;
    privateServiceConnection?: string;
    privateDnsZoneGroup?: string;
    /** Used when this registry creates the shared privatelink DNS zone */
    privateDnsZoneVnetLink?: string;
  };
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
  const registry = new ContainerRegistry(scope, `acr-${config.key ?? config.name}`, {
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
      config.names?.privateDnsZoneVnetLink,
    );
    privateDnsZone = sharedResources.privateDnsZone;
  }

  // 3. Private Endpoint with Automatic DNS Registration
  const privateEndpoint = new PrivateEndpoint(scope, `acr-pe-${config.key ?? config.name}`, {
    provider,
    name: resourceName(
      config.names?.privateEndpoint,
      "azure",
      "private-endpoint",
      config.name,
    ),
    resourceGroupName: config.resourceGroupName,
    location: config.location,
    subnetId: config.subnetId,
    privateServiceConnection: {
      name: resourceName(
        config.names?.privateServiceConnection,
        "azure",
        "private-service-connection",
        config.name,
      ),
      privateConnectionResourceId: registry.id,
      subresourceNames: ["registry"],
      isManualConnection: false,
    },
    // Use privateDnsZoneGroup for auto-syncing all resolving IPs (Login + Data endpoints)
    privateDnsZoneGroup: {
      name: resourceName(
        config.names?.privateDnsZoneGroup,
        "azure",
        "private-dns-zone-group",
        config.name,
      ),
      privateDnsZoneIds: [privateDnsZone.id],
    },
  });

  return {
    registry,
    privateEndpoint,
    privateDnsZone,
  };
}
