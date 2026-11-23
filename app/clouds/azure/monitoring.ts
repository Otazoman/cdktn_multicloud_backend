import {
  azureAlertingConfig,
  azureMonitorConfig,
} from "../../config/azure/azuresettings";
import { buildStage } from "../../config/buildstage";
import { isFeatureEnabled } from "../../config/features";
import { createAzureAvailabilityTests } from "../../constructs/observability/azureavailability";
import {
  AzureMetricAlertDefinition,
  AzureMonitorResources,
} from "../../constructs/observability/azuremonitor";
import { API_READINESS_PATH } from "../apicontainer";
import { apiHealthTargets } from "../healthurls";
import { AzureBuildContext } from "./context";

/**
 * 8. Log / metric alerts (feature: alerting)
 *
 * Created after every other Azure resource so that alerts can target them.
 * The Log Analytics Workspace and Action Groups are created up-front in
 * index.ts (step 1.5).
 */
export function createAzureMonitoring(ctx: AzureBuildContext): void {
  const { scope, azureProvider, containerApps, azureMonitor, appGwsByName } = ctx;

  if (!isFeatureEnabled("azure", "alerting")) {
    return;
  }
  const { logAlerts, uptimeCheck } = azureAlertingConfig;
  const metricAlerts = azureAlertingConfig.metricAlerts.filter(
    ({ enabled }) => enabled !== false,
  );

  const getActionGroupIds = (keys: string[] | undefined, alertName: string) =>
    keys?.map((key) => {
      const groupName = azureMonitorConfig.actionGroups.find(
        (group) => group.key === key,
      )?.name;
      const group = groupName
        ? azureMonitor?.createdActionGroups[groupName]
        : undefined;
      if (!group) {
        throw new Error(
          `Notification target "${key}" referenced by alert "${alertName}" was not found. ` +
            `Make sure it is defined in config/azure/azuremonitor.ts (azureMonitorConfig.actionGroups) ` +
            `and azureMonitorConfig.isEnabled is true.`,
        );
      }
      return group.id;
    });

  const getTargetId = (
    target: { type: "containerApp" | "applicationGateway"; name: string },
    alertName: string,
  ): string => {
    if (target.type === "applicationGateway") {
      return appGwsByName![target.name].appGw.id;
    }
    const app = containerApps.get(target.name);
    if (!app) {
      throw new Error(
        `Container App "${target.name}" referenced by alert "${alertName}" was not found. ` +
          `Make sure it is defined in config/azure/containerapps.ts (build: true) ` +
          `and clouds.azure.features.containers is enabled.`,
      );
    }
    return app.id;
  };

  const workspaceId = azureMonitor?.logAnalyticsWorkspace?.id;

  // Availability tests of /readyz per built Application Gateway, from build
  // stage 3 (before, the placeholder image does not answer /readyz)
  const uptimeTargets =
    uptimeCheck.enabled && buildStage() >= 3 ? apiHealthTargets(scope, "azure") : [];
  const uptimeAlerts: AzureMetricAlertDefinition[] = [];
  if (uptimeTargets.length > 0) {
    checkAzureUptimeConfig(uptimeCheck);
    if (!workspaceId) {
      throw new Error(
        "Azure availability tests (azureAlertingConfig.uptimeCheck) need the Log Analytics " +
          "Workspace: set azureMonitorConfig.isEnabled to true, or uptimeCheck.enabled to false.",
      );
    }
    const tests = createAzureAvailabilityTests(scope, azureProvider, {
      resourceGroupName: azureMonitorConfig.resourceGroupName,
      location: azureMonitorConfig.location,
      applicationInsightsName: azureMonitorConfig.applicationInsightsName,
      workspaceId,
      geoLocations: uptimeCheck.geoLocations.slice(0, uptimeCheck.locationCount),
      frequency: uptimeCheck.frequency,
      timeout: uptimeCheck.timeout,
      tests: uptimeTargets.map((target) => ({
        name: `${target.lbName}-readyz`,
        url: `${target.https ? "https" : "http"}://${target.address}${API_READINESS_PATH}`,
      })),
      tags: azureMonitorConfig.tags,
    });
    uptimeTargets.forEach((target) => {
      const webTest = tests.webTests[`${target.lbName}-readyz`];
      const name = `${target.lbName}-uptime`;
      uptimeAlerts.push({
        name,
        scopes: [webTest.id, tests.applicationInsights.id],
        webTestAvailability: {
          webTestId: webTest.id,
          componentId: tests.applicationInsights.id,
          failedLocationCount: uptimeCheck.failedLocationCount,
        },
        frequency: "PT1M",
        windowSize: "PT5M",
        actionGroups: getActionGroupIds(uptimeCheck.notify, name),
      });
    });
  }
  if (logAlerts.length === 0 && metricAlerts.length === 0 && uptimeAlerts.length === 0) {
    return;
  }

  new AzureMonitorResources(scope, "azure-alerting-monitor", azureProvider, {
    resourceGroupName: azureMonitorConfig.resourceGroupName,
    location: azureMonitorConfig.location,
    tags: azureMonitorConfig.tags,
    logAlerts: logAlerts.map(({ notify, scopes, ...alert }) => {
      const resolvedScopes = scopes ?? (workspaceId ? [workspaceId] : undefined);
      if (!resolvedScopes) {
        throw new Error(
          `Log alert "${alert.name}" has no scopes and there is no Log Analytics Workspace ` +
            `(azureMonitorConfig.isEnabled is false).`,
        );
      }
      return {
        ...alert,
        scopes: resolvedScopes,
        actionGroups: getActionGroupIds(notify, alert.name),
      };
    }),
    metricAlerts: [
      ...metricAlerts
      // Alerts of an Application Gateway only while it is built
      .filter(
        ({ target }) => target?.type !== "applicationGateway" || appGwsByName?.[target.name],
      )
      .map(({ notify, scopes, target, enabled: _enabled, ...alert }) => {
      const resolvedScopes =
        scopes ?? (target ? [getTargetId(target, alert.name)] : undefined);
      if (!resolvedScopes) {
        throw new Error(
          `Metric alert "${alert.name}" needs either target or scopes.`,
        );
      }
      return {
        ...alert,
        scopes: resolvedScopes,
        actionGroups: getActionGroupIds(notify, alert.name),
      };
    }),
      ...uptimeAlerts,
    ],
  });
}

/** Stops the synthesis on values Azure would reject or that never alert. */
function checkAzureUptimeConfig(config: typeof azureAlertingConfig.uptimeCheck): void {
  const where = "azureAlertingConfig.uptimeCheck (config/azure/azuremonitor.ts)";
  if (![300, 600, 900].includes(config.frequency)) {
    throw new Error(`${where}: frequency must be 300, 600 or 900 (got ${config.frequency})`);
  }
  if (new Set(config.geoLocations).size !== config.geoLocations.length) {
    throw new Error(`${where}: geoLocations has duplicates`);
  }
  // Azure accepts up to 16 locations per test
  const max = Math.min(config.geoLocations.length, 16);
  if (!Number.isInteger(config.locationCount) || config.locationCount < 1 || config.locationCount > max) {
    throw new Error(
      `${where}: locationCount must be 1 to ${max} (the geoLocations candidates; got ${config.locationCount})`,
    );
  }
  if (
    !Number.isInteger(config.failedLocationCount) ||
    config.failedLocationCount < 1 ||
    config.failedLocationCount > config.locationCount
  ) {
    throw new Error(
      `${where}: failedLocationCount must be 1 to locationCount (${config.locationCount}); ` +
        `with more, the alert never fires (got ${config.failedLocationCount})`,
    );
  }
}
