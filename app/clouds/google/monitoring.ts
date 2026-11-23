import { buildStage } from "../../config/buildstage";
import { isFeatureEnabled } from "../../config/features";
import {
  GoogleAlertPolicyConfig,
  PROJECT_NAME,
  gcpLbConfigs,
  googleAlertingConfig,
} from "../../config/google/googlesettings";
import {
  GcpMonitoringResources,
  GcpNotificationChannelDefinition,
} from "../../constructs/observability/googlecloudmonitoring";
import { createGcpUptimeCheck } from "../../constructs/observability/googleuptime";
import { resourceName } from "../../utils/naming";
import { API_READINESS_PATH } from "../apicontainer";
import { apiHealthTargets } from "../healthurls";
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

  // Uptime checks of /readyz per built load balancer, from build stage 3
  // (before, the placeholder image does not answer /readyz)
  const uptime = googleAlertingConfig.uptimeCheck;
  const uptimePolicies: GoogleAlertPolicyConfig[] =
    uptime.enabled && buildStage() >= 3
      ? apiHealthTargets(scope, "google").map((target) => {
          const check = createGcpUptimeCheck(scope, googleProvider, {
            key: target.lbName,
            displayName: `${target.lbName}-readyz`,
            projectId: PROJECT_NAME,
            host: target.address,
            https: target.https,
            path: API_READINESS_PATH,
            period: uptime.period,
            timeout: uptime.timeout,
            selectedRegions: uptime.selectedRegions,
          });
          // Google's recommended condition: the number of failing checker
          // regions (REDUCE_COUNT_FALSE)
          return {
            displayName: `${target.lbName}-uptime`,
            combiner: "OR" as const,
            conditionFilter:
              'metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND ' +
              `metric.label.check_id="${check.uptimeCheckId}" AND resource.type="uptime_url"`,
            aggregation: {
              alignmentPeriod: uptime.period,
              perSeriesAligner: "ALIGN_NEXT_OLDER",
              crossSeriesReducer: "REDUCE_COUNT_FALSE",
              groupByFields: ["resource.label.*"],
            },
            duration: uptime.duration,
            comparison: "COMPARISON_GT" as const,
            thresholdValue: uptime.failedRegionsAbove,
            notify: uptime.notify,
          };
        })
      : [];

  new GcpMonitoringResources(scope, "google-alerting-monitoring", googleProvider, {
    projectId: PROJECT_NAME,
    logMetrics: googleAlertingConfig.logMetrics,
    notificationChannels,
    alertPolicies: [...googleAlertingConfig.alertPolicies, ...uptimePolicies]
      .filter(({ enabled }) => enabled !== false)
      // Policies of a load balancer only while it is built (HTTP and HTTPS
      // load balancers are alternatives)
      .filter(
        ({ loadBalancer }) =>
          !loadBalancer ||
          (isFeatureEnabled("google", "containers") &&
            gcpLbConfigs.some((lb) => lb.build && lb.name === loadBalancer)),
      )
      // Build results only with CI/CD
      .filter(({ cicd }) => !cicd || isFeatureEnabled("google", "cicd"))
      .map(({ notify, loadBalancer: _loadBalancer, cicd: _cicd, enabled: _enabled, ...policy }) => ({
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
