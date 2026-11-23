import { MonitoringUptimeCheckConfig } from "@cdktn/provider-google/lib/monitoring-uptime-check-config";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";

/**
 * Uptime check of an HTTP(S) endpoint from Google's checkers on the
 * internet (monitored resource uptime_url). Alert on the metric
 * monitoring.googleapis.com/uptime_check/check_passed with
 * metric.label.check_id = uptimeCheckId.
 */
export interface GcpUptimeCheckParams {
  /** Construct ID key (Terraform address) */
  key: string;
  displayName: string;
  projectId: string;
  /** Host name or IP address checked */
  host: string;
  https: boolean;
  /** Path checked, e.g. "/readyz" */
  path: string;
  /** "60s", "300s", "600s" or "900s" */
  period: string;
  /** 1 to 60 seconds, e.g. "10s" */
  timeout: string;
  /** Checker regions (USA_OREGON, USA_IOWA, USA_VIRGINIA, EUROPE, SOUTH_AMERICA, ASIA_PACIFIC; at least 3 locations). Omitted: all */
  selectedRegions?: string[];
}

export function createGcpUptimeCheck(
  scope: Construct,
  provider: GoogleProvider,
  params: GcpUptimeCheckParams,
): MonitoringUptimeCheckConfig {
  return new MonitoringUptimeCheckConfig(scope, `gcp-uptime-check-${params.key}`, {
    provider,
    project: params.projectId,
    displayName: params.displayName,
    period: params.period,
    timeout: params.timeout,
    selectedRegions: params.selectedRegions,
    monitoredResource: {
      type: "uptime_url",
      labels: { project_id: params.projectId, host: params.host },
    },
    httpCheck: {
      path: params.path,
      port: params.https ? 443 : 80,
      useSsl: params.https,
      // The address may be an IP (no public DNS): the certificate is not
      // checked, only the answer of /readyz
      validateSsl: false,
    },
  });
}
