import {
  azureAcaConfigs,
  azureAcaEnvironmentDefaults,
  azureAcaEnvironmentSettings,
  azureLogArchiveConfig,
  azureMonitorConfig,
} from "../../config/azure/azuresettings";
import { isFeatureEnabled } from "../../config/features";
import { createAzureLogArchive } from "../../constructs/observability/azurelogarchive";
import { AzureBuildContext } from "./context";

/**
 * 5.8. Log archive storage account (feature: logArchive). Created before the
 * Container Apps environments, whose diagnostic settings write to it
 * (ctx.logArchive, used by container.ts).
 */
export function createAzureLogArchiveResources(ctx: AzureBuildContext): void {
  const { scope, azureProvider } = ctx;

  if (!isFeatureEnabled("azure", "logArchive")) {
    return;
  }
  const config = azureLogArchiveConfig;

  const builtEnvs = isFeatureEnabled("azure", "containers")
    ? [...new Set(azureAcaConfigs.filter((c) => c.build).map((c) => c.environmentName))]
    : [];
  const logsEnabled = (env: string) =>
    ({ ...azureAcaEnvironmentDefaults, ...azureAcaEnvironmentSettings[env] }).logs;

  const environments = config.acaEnvironments ?? builtEnvs.filter(logsEnabled);
  environments.forEach((env) => {
    if (!builtEnvs.includes(env)) {
      throw new Error(
        `Container Apps environment "${env}" in azureLogArchiveConfig.acaEnvironments was not found. ` +
          `Make sure an app of config/azure/containerapps.ts (build: true) uses it and ` +
          `clouds.azure.features.containers is enabled.`,
      );
    }
    if (!logsEnabled(env)) {
      throw new Error(
        `Container Apps environment "${env}" in azureLogArchiveConfig.acaEnvironments has logs: false ` +
          `(azureAcaEnvironmentSettings in config/azure/containerapps.ts).`,
      );
    }
  });
  if (environments.length === 0) {
    return;
  }

  if (!config.storageAccount.name) {
    throw new Error(
      "azureLogArchiveConfig.storageAccount.name (config/azure/azuremonitor.ts) is required when " +
        "clouds.azure.features.logArchive is enabled (storage account names are globally unique).",
    );
  }
  if (!/^[a-z0-9]{3,24}$/.test(config.storageAccount.name)) {
    throw new Error(
      `azureLogArchiveConfig.storageAccount.name "${config.storageAccount.name}" must be ` +
        "3-24 lowercase letters and digits.",
    );
  }

  const { storageAccount } = createAzureLogArchive(scope, azureProvider, {
    resourceGroupName: azureMonitorConfig.resourceGroupName,
    location: azureMonitorConfig.location,
    storageAccountName: config.storageAccount.name,
    replication: config.storageAccount.replication,
    infrastructureEncryption: config.storageAccount.infrastructureEncryption,
    deleteOnDestroy: config.deleteOnDestroy,
    lifecycle: config.storageAccount.lifecycle,
    tags: azureMonitorConfig.tags,
  });
  ctx.logArchive = { storageAccount, environments };
}
