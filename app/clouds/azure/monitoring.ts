import {
  azureAlertingConfig,
  azureMonitorConfig,
} from "../../config/azure/azuresettings";
import { isFeatureEnabled } from "../../config/features";
import { AzureMonitorResources } from "../../constructs/observability/azuremonitor";
import { AzureBuildContext } from "./context";

/**
 * 8. Log / metric alerts (feature: alerting)
 *
 * Created after every other Azure resource so that alerts can target them.
 * The Log Analytics Workspace and Action Groups are created up-front in
 * index.ts (step 1.5).
 */
export function createAzureMonitoring(ctx: AzureBuildContext): void {
  const { scope, azureProvider, containerApps, azureMonitor } = ctx;

  if (!isFeatureEnabled("azure", "alerting")) {
    return;
  }
  const { logAlerts, metricAlerts } = azureAlertingConfig;
  if (logAlerts.length === 0 && metricAlerts.length === 0) {
    return;
  }

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
    target: { type: "containerApp"; name: string },
    alertName: string,
  ): string => {
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
    metricAlerts: metricAlerts.map(({ notify, scopes, target, ...alert }) => {
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
  });
}
