import { PrivateDnsZone } from "@cdktn/provider-azurerm/lib/private-dns-zone";
import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";

import { azureDevOpsAcrConfigs } from "../../config/azure/azuresettings";
import { isFeatureEnabled } from "../../config/features";
import { createAzureDevOpsAcrResources } from "../../constructs/cicd/azuredevopsacr";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { AzureBuildContext } from "./context";

/** 5.5. Container Registry (feature: cicd). Runs before containers, which pull from these registries */
export function createAzureCicd(ctx: AzureBuildContext): void {
  const { scope, azureProvider, azureVnetResources, acrRegistryMap } = ctx;

  // ──────────────────────────────────────────────
  // 5.5. Azure DevOps / ACR
  // ──────────────────────────────────────────────
  let sharedAcrPrivateDnsZone: PrivateDnsZone | undefined = undefined;

  if (isFeatureEnabled("azure", "cicd")) {
    azureDevOpsAcrConfigs
      .filter((c) => c.build)
      .forEach((config) => {
        const subnetResource = (
          azureVnetResources.subnets
        )[config.subnetName];
        const subnetId: string = subnetResource?.id ?? subnetResource ?? "";

        if (!subnetId) {
          throw new Error(
            `Subnet ${config.subnetName} not found for ACR ${config.name}`,
          );
        }

        // Pass the shared Private DNS Zone to follow the "pass-and-reuse" pattern
        const acrRes = createAzureDevOpsAcrResources(
          scope,
          azureProvider,
          {
            ...config,
            subnetId,
            virtualNetwork: azureVnetResources.vnet as VirtualNetwork,
          },
          sharedAcrPrivateDnsZone,
        );

        // Capture the first created Private DNS Zone to pass into subsequent iterations
        if (!sharedAcrPrivateDnsZone && acrRes.privateDnsZone) {
          sharedAcrPrivateDnsZone = acrRes.privateDnsZone;
        }

        acrRegistryMap.set(config.name, acrRes.registry);

        // Ensure explicit execution dependency ordering between network layers and resources
        addTerraformDependency(acrRes.registry, azureVnetResources.vnet);
        addTerraformDependency(acrRes.privateEndpoint, subnetResource);

        // If a new Private DNS Zone was generated or linked inside the construct,
        // guarantee it completes setup before the Private Endpoint tries to bind to it
        if (acrRes.privateDnsZone) {
          addTerraformDependency(acrRes.privateEndpoint, acrRes.privateDnsZone);
        }
      });
  }

}
