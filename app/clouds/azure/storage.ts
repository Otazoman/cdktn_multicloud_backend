import { PrivateDnsZone } from "@cdktn/provider-azurerm/lib/private-dns-zone";

import { azureFilesConfigs } from "../../config/azure/azuresettings";
import { isFeatureEnabled } from "../../config/features";
import {
  AzureFilesOutput,
  createAzureFilesResources,
} from "../../constructs/storage/azurefiles";
import { AzureBuildContext } from "./context";

/** 3. Azure Files (feature: storage) */
export function createAzureStorage(ctx: AzureBuildContext): void {
  const { scope, azureProvider, output, azureVnetResources } = ctx;

  // ──────────────────────────────────────────────
  // 3. Azure Files
  // ──────────────────────────────────────────────
  if (isFeatureEnabled("azure", "storage")) {
    const buildableAzureFilesConfigs = azureFilesConfigs.filter((c) => c.build);

    let sharedFilesPrivateDnsZone: PrivateDnsZone | undefined = undefined;
    const azureFilesOutputs: AzureFilesOutput[] = [];

    buildableAzureFilesConfigs.forEach((config) => {
      let azureRes: AzureFilesOutput;

      if (config.privateEndpointEnabled && config.subnetKey) {
        const subnetResource = (
          azureVnetResources.subnets
        )[config.subnetKey];
        const subnetId: string = subnetResource?.id ?? subnetResource ?? "";
        const virtualNetworkId: string =
          azureVnetResources.vnet.id ?? "";

        azureRes = createAzureFilesResources(scope, azureProvider, config, {
          subnetId,
          virtualNetworkId,
          sharedPrivateDnsZone: sharedFilesPrivateDnsZone,
        });

        if (!sharedFilesPrivateDnsZone && azureRes.privateDnsZone) {
          sharedFilesPrivateDnsZone = azureRes.privateDnsZone;
        }
      } else {
        azureRes = createAzureFilesResources(scope, azureProvider, config);
      }

      azureFilesOutputs.push(azureRes);
    });

    output.filesInstances = buildableAzureFilesConfigs
      .map((cfg, idx) => {
        if (!cfg.cnameRecordName) return null;
        const storageAccount = azureFilesOutputs[idx]?.storageAccount;
        if (!storageAccount) return null;
        const fqdn = cfg.privateEndpointEnabled
          ? `${cfg.accountName}.privatelink.file.core.windows.net`
          : `${cfg.accountName}.file.core.windows.net`;
        return { cnameRecordName: cfg.cnameRecordName, fqdn };
      })
      .filter(
        (item): item is { cnameRecordName: string; fqdn: string } =>
          item !== null,
      );
  }

}
