/**
 * Azure cloud module (registered in clouds/registry.ts).
 *
 * Resource creation order:
 *
 *   1. VNet / Subnets / NSGs / NAT                                index.ts
 *   1.5. Azure Monitor (Log Analytics Workspace,
 *        Action Groups with features.alerting)                    index.ts
 *   2. Public DNS Zone          (features.dns)                    dns.ts
 *   3. Azure Files              (features.storage)                storage.ts
 *   4. Azure Database           (features.dbs)                    database.ts
 *   5. Azure VM                 (features.vms)                    compute.ts
 *   5.5. Container Registry     (features.cicd)                   cicd.ts
 *   5.8. Log archive storage    (features.logArchive)             logarchive.ts
 *   6. Container Apps + Application Gateway, 7. DNS A-records
 *                               (features.containers [+ dns])     container.ts
 *   8. Log / Metric Alerts      (features.alerting)               monitoring.ts
 *
 * Values shared between the modules are passed as AzureBuildContext
 * (context.ts).
 */

import { ContainerApp } from "@cdktn/provider-azurerm/lib/container-app";
import { ContainerRegistry } from "@cdktn/provider-azurerm/lib/container-registry";
import { LogAnalyticsWorkspace } from "@cdktn/provider-azurerm/lib/log-analytics-workspace";
import { DnsZone } from "@cdktn/provider-azurerm/lib/dns-zone";
import { Providers } from "../../providers/providers";
import { Construct } from "constructs";

import {
  azureMonitorConfig,
  azureVnetResourcesparams,
} from "../../config/azure/azuresettings";
import { isCloudEnabled, isFeatureEnabled } from "../../config/features";
import { AzureMonitorResources } from "../../constructs/observability/azuremonitor";
import { createAzureVnetResources } from "../../constructs/vpcnetwork/azurevnet";
import { AzureResourcesOutput, AzureVnetResources } from "./types";
import { AzureBuildContext } from "./context";
import { createAzurePublicDns } from "./dns";
import { createAzureStorage } from "./storage";
import { createAzureDatabaseResources } from "./database";
import { createAzureVmResources } from "./compute";
import { createAzureCicd } from "./cicd";
import { createAzureContainers } from "./container";
import { createAzureMonitoring } from "./monitoring";
import { createAzureLogArchiveResources } from "./logarchive";

export const createAzureResources = (
  scope: Construct,
  providers: Providers,
): AzureResourcesOutput => {
  const azureProvider = providers.azure;
  const output: AzureResourcesOutput = {};

  // ──────────────────────────────────────────────
  // 1. VNet
  // ──────────────────────────────────────────────
  if (!isCloudEnabled("azure")) {
    return output;
  }

  const vnetRaw = createAzureVnetResources(
    scope,
    azureProvider,
    azureVnetResourcesparams,
  );

  const azureVnetResources: AzureVnetResources = {
    vnet: vnetRaw.vnet,
    nsgs: vnetRaw.nsgs,
    nsgRules: vnetRaw.nsgRules,
    subnets: vnetRaw.subnets,
    subnetAssociations: vnetRaw.subnetAssociations,
    params: vnetRaw.params,
    lastSubnet: vnetRaw.lastSubnet,
  };

  output.vpc = azureVnetResources;

  // ──────────────────────────────────────────────
  // 1.5. Azure Monitor (Log Analytics Workspace, Action Groups)
  // ──────────────────────────────────────────────
  // Created up-front so that cross-cloud orchestrators (e.g., vpnResources.ts)
  // can reuse the Log Analytics Workspace ID instead of creating their own.
  // Action Groups are created only with features.alerting; the alerts that
  // use them are created last (monitoring.ts).
  let monitorResources:
    | { logAnalyticsWorkspace?: LogAnalyticsWorkspace }
    | undefined;
  let azureMonitor: AzureMonitorResources | undefined;
  if (azureMonitorConfig.isEnabled) {
    azureMonitor = new AzureMonitorResources(
      scope,
      "AzureMonitorResources",
      azureProvider,
      {
        ...azureMonitorConfig,
        actionGroups: isFeatureEnabled("azure", "alerting")
          ? azureMonitorConfig.actionGroups
          : undefined,
      },
    );
    monitorResources = {
      logAnalyticsWorkspace: azureMonitor.logAnalyticsWorkspace,
    };
    output.monitorResources = monitorResources;
  }


  // Populated by createAzurePublicDns, used by createAzureContainers
  const publicZones: Record<string, DnsZone> = {};
  // Populated by createAzureCicd, used by createAzureContainers
  const acrRegistryMap = new Map<string, ContainerRegistry>();
  // Populated by createAzureContainers, used by createAzureMonitoring
  const containerApps = new Map<string, ContainerApp>();

  const ctx: AzureBuildContext = {
    scope,
    azureProvider,
    output,
    azureVnetResources,
    publicZones,
    acrRegistryMap,
    containerApps,
    azureMonitor,
  };

  createAzurePublicDns(ctx);
  createAzureStorage(ctx);
  createAzureDatabaseResources(ctx);
  createAzureVmResources(ctx);
  createAzureCicd(ctx);
  createAzureLogArchiveResources(ctx);
  createAzureContainers(ctx);
  createAzureMonitoring(ctx);

  return output;
};
