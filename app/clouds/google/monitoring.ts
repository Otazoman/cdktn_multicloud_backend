import { isFeatureEnabled } from "../../config/features";
import { PROJECT_NAME, googleAlertingConfig } from "../../config/google/googlesettings";
import {
  GcpMonitoringResources,
  GcpNotificationChannelDefinition,
} from "../../constructs/observability/googlecloudmonitoring";
import { resourceName } from "../../utils/naming";
import { GoogleBuildContext } from "./context";

/** 10. Notification channels, log-based metrics and alert policies (feature: alerting) */
export function createGoogleMonitoring(ctx: GoogleBuildContext): void {
  const { scope, googleProvider } = ctx;

  if (!isFeatureEnabled("google", "alerting")) {
    return;
  }

  // One email channel per address; a target key resolves to the display
  // names of its channels.
  const notificationChannels: GcpNotificationChannelDefinition[] = [];
  const channelNamesByKey: Record<string, string[]> = {};
  googleAlertingConfig.notificationTargets.forEach((target) => {
    const prefix = resourceName(target.name, "google", "alerts", target.key);
    channelNamesByKey[target.key] = target.emails.map((email) => {
      const displayName = `${prefix} ${email}`;
      notificationChannels.push({
        displayName,
        type: "email",
        labels: { email_address: email },
      });
      return displayName;
    });
  });

  new GcpMonitoringResources(scope, "google-alerting-monitoring", googleProvider, {
    projectId: PROJECT_NAME,
    logMetrics: googleAlertingConfig.logMetrics,
    notificationChannels,
    alertPolicies: googleAlertingConfig.alertPolicies.map(
      ({ notify, ...policy }) => ({
        ...policy,
        notificationChannels: notify?.flatMap((key) => {
          const names = channelNamesByKey[key];
          if (!names) {
            throw new Error(
              `Notification target "${key}" referenced by alert policy "${policy.displayName}" was not found. ` +
                `Make sure it is defined in config/google/monitoring.ts (notificationTargets).`,
            );
          }
          return names;
        }),
      }),
    ),
  });
}
