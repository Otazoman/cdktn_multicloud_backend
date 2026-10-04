import { DnsZone } from "@cdktn/provider-azurerm/lib/dns-zone";
import { TerraformOutput } from "cdktn";

import { azureAppGwConfigs } from "../../config/azure/azuresettings";
import { isFeatureEnabled } from "../../config/features";
import { AzureBuildContext } from "./context";

/** 2. Public DNS zones (feature: dns) */
export function createAzurePublicDns(ctx: AzureBuildContext): void {
  const { scope, azureProvider, publicZones } = ctx;

  // ──────────────────────────────────────────────
  // 2. Public DNS Zone
  // ──────────────────────────────────────────────

  if (isFeatureEnabled("azure", "dns") && azureAppGwConfigs) {
    const unique = (arr: (string | undefined)[]) =>
      Array.from(new Set(arr.filter(Boolean))) as string[];

    const azureSubdomains = unique(
      azureAppGwConfigs
        .filter((c) => c.build)
        .map((c) => c.dnsConfig?.subdomain),
    );

    azureSubdomains.forEach((subdomain) => {
      const zoneSafeName = subdomain.replace(/\./g, "-");
      const zone = new DnsZone(scope, `p-zone-azure-${zoneSafeName}`, {
        provider: azureProvider,
        name: subdomain,
        resourceGroupName: azureAppGwConfigs[0].resourceGroupName,
      });
      publicZones[subdomain] = zone;
      new TerraformOutput(scope, `azure-ns-${zoneSafeName}`, {
        value: zone.nameServers,
      });
    });
  }

}
