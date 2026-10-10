/**
 * Log collection (FEAT-03 step 4): per-resource `logs` switches, Google log
 * buckets / sinks / _Default exclusions, Azure Container Apps environment
 * logs and table retention, AWS VPN log format and ECS log settings.
 */
import { awsEcsClusterSettings, awsEcsConfigs } from "../config/aws/ecs";
import { awsVpnparams } from "../config/aws/vpn";
import { azureMonitorConfig } from "../config/azure/azuremonitor";
import { azureAcaEnvironmentDefaults } from "../config/azure/containerapps";
import { azureVpnparams } from "../config/azure/vpn";
import { googleLogBucketsConfig } from "../config/google/cloudlogging";
import { gcpRunConfigs } from "../config/google/cloudrun";
import { googleVpnParams } from "../config/google/vpn";
import {
  FEATURE_SETS,
  buildDependencyGraph,
  findDependencyCycle,
  synthCase,
} from "../scripts/dev/synthMatrix";

const resourcesOf = (synth: any, type: string): any[] =>
  Object.values(synth.resource?.[type] ?? {});

const synthAllOn = () =>
  synthCase({
    name: "logging",
    overrides: {
      ...FEATURE_SETS.allOn,
      env: "prod",
      awsToGoogle: true,
      awsToAzure: true,
      googleToAzure: true,
    },
  });

// Config objects mutated by the tests, restored after each test.
const mutable: object[] = [
  awsVpnparams.customerGateways.google,
  awsVpnparams.customerGateways.azure,
  awsEcsClusterSettings,
  ...awsEcsConfigs,
  googleVpnParams,
  ...gcpRunConfigs,
  ...googleLogBucketsConfig,
  azureVpnparams,
  azureAcaEnvironmentDefaults,
  azureMonitorConfig,
];
const snapshots = mutable.map((o) => ({ ...o }));

afterEach(() => {
  mutable.forEach((o, i) => {
    Object.keys(o).forEach((k) => delete (o as any)[k]);
    Object.assign(o, snapshots[i]);
  });
});

describe("logging: defaults (logs on)", () => {
  let synth: any;
  beforeAll(() => {
    synth = synthAllOn();
  }, 120000);

  test("has no dependency cycle", () => {
    expect(findDependencyCycle(buildDependencyGraph(synth))).toBeUndefined();
  });

  test("AWS VPN tunnels log to their log group in text format", () => {
    const connections = resourcesOf(synth, "aws_vpn_connection");
    expect(connections.length).toBeGreaterThan(0);
    connections.forEach((c) => {
      for (const options of [c.tunnel1_log_options, c.tunnel2_log_options]) {
        expect(options.cloudwatch_log_options).toEqual({
          log_enabled: true,
          log_group_arn: expect.stringContaining("${aws_cloudwatch_log_group."),
          log_output_format: "text",
        });
      }
    });
  });

  test("Google: VPN and Cloud Run logs go to their buckets and are excluded from _Default", () => {
    const buckets = resourcesOf(synth, "google_logging_project_bucket_config");
    expect(buckets.map((b) => b.bucket_id).sort()).toEqual([
      expect.stringMatching(/-google-logs-cloudrun$/),
      expect.stringMatching(/-google-logs-vpn$/),
    ]);
    buckets.forEach((b) => {
      expect(b).toMatchObject({
        location: "asia-northeast1",
        retention_days: 30,
        enable_analytics: false,
      });
    });

    const sinks = resourcesOf(synth, "google_logging_project_sink");
    const exclusions = resourcesOf(synth, "google_logging_project_exclusion");
    expect(sinks).toHaveLength(1 + gcpRunConfigs.filter((c) => c.build).length);
    expect(exclusions.map((e) => e.filter).sort()).toEqual(
      sinks.map((s) => s.filter).sort(),
    );
    const vpnSink = sinks.find((s) => s.filter.includes("vpn_gateway"));
    expect(vpnSink.filter).toBe(
      'resource.type="vpn_gateway" OR resource.type="gce_router"',
    );
    expect(vpnSink.destination).toContain(
      "logging.googleapis.com/${google_logging_project_bucket_config.log-bucket-vpn.id}",
    );
  });

  test("Azure: VPN and Container Apps environment logs go to the workspace", () => {
    const settings = resourcesOf(synth, "azurerm_monitor_diagnostic_setting");
    const vng = settings.find((s) =>
      s.target_resource_id.includes("azurerm_virtual_network_gateway"),
    );
    expect(vng).toBeDefined();

    const builtEnvs = resourcesOf(synth, "azurerm_container_app_environment");
    expect(builtEnvs.length).toBeGreaterThan(0);
    builtEnvs.forEach((env) => expect(env.logs_destination).toBe("azure-monitor"));
    const acaSettings = settings.filter((s) =>
      s.target_resource_id.includes("azurerm_container_app_environment"),
    );
    expect(acaSettings).toHaveLength(builtEnvs.length);
    acaSettings.forEach((s) => {
      expect(s.log_analytics_destination_type).toBe("Dedicated");
      expect(s.enabled_log).toEqual([
        { category: "ContainerAppConsoleLogs" },
        { category: "ContainerAppSystemLogs" },
      ]);
    });

    const tables = resourcesOf(synth, "azurerm_log_analytics_workspace_table");
    expect(Object.fromEntries(tables.map((t) => [t.name, t.retention_in_days]))).toEqual(
      azureMonitorConfig.tableRetention,
    );
  });

  test("ECS keeps the account defaults for Container Insights and the log mode", () => {
    resourcesOf(synth, "aws_ecs_cluster").forEach((c) =>
      expect(c.setting).toBeUndefined(),
    );
    resourcesOf(synth, "aws_ecs_task_definition").forEach((t) => {
      const options = JSON.parse(t.container_definitions)[0].logConfiguration.options;
      expect(options.mode).toBeUndefined();
      expect(options["max-buffer-size"]).toBeUndefined();
    });
  });
});

describe("logging: switches", () => {
  test("logs off: nothing is stored, Google logs are only excluded", () => {
    awsVpnparams.customerGateways.google.logs = false;
    awsVpnparams.customerGateways.azure.logs = false;
    googleVpnParams.logs = false;
    gcpRunConfigs.forEach((c) => (c.logs = false));
    azureVpnparams.logs = false;
    azureAcaEnvironmentDefaults.logs = false;

    const synth = synthAllOn();
    resourcesOf(synth, "aws_vpn_connection").forEach((c) => {
      expect(c.tunnel1_log_options.cloudwatch_log_options).toEqual({ log_enabled: false });
      expect(c.tunnel2_log_options.cloudwatch_log_options).toEqual({ log_enabled: false });
    });
    expect(resourcesOf(synth, "google_logging_project_bucket_config")).toHaveLength(0);
    expect(resourcesOf(synth, "google_logging_project_sink")).toHaveLength(0);
    expect(resourcesOf(synth, "google_logging_project_exclusion")).toHaveLength(
      1 + gcpRunConfigs.filter((c) => c.build).length,
    );
    expect(resourcesOf(synth, "azurerm_monitor_diagnostic_setting")).toHaveLength(0);
    resourcesOf(synth, "azurerm_container_app_environment").forEach((env) =>
      expect(env.logs_destination).toBeUndefined(),
    );
  }, 120000);

  test("AWS VPN json format, ECS Container Insights and log mode", () => {
    awsVpnparams.customerGateways.azure.logOutputFormat = "json";
    awsEcsClusterSettings["main-cluster"] = { containerInsights: "enhanced" };
    Object.assign(awsEcsConfigs[0], { logMode: "non-blocking", logMaxBufferSize: "25m" });

    const synth = synthAllOn();
    const formats = resourcesOf(synth, "aws_vpn_connection").map(
      (c) => c.tunnel1_log_options.cloudwatch_log_options.log_output_format,
    );
    expect(formats).toContain("json");
    expect(formats).toContain("text");

    const [cluster] = resourcesOf(synth, "aws_ecs_cluster");
    expect(cluster.setting).toEqual([{ name: "containerInsights", value: "enhanced" }]);
    const options = resourcesOf(synth, "aws_ecs_task_definition")
      .map((t) => JSON.parse(t.container_definitions)[0])
      .find((d) => d.name === awsEcsConfigs[0].containerName).logConfiguration.options;
    expect(options).toMatchObject({ mode: "non-blocking", "max-buffer-size": "25m" });
  }, 120000);

  test("Google bucket settings are taken from cloudlogging.ts", () => {
    Object.assign(googleLogBucketsConfig[0], {
      bucketId: "vpn-logs-v2",
      retentionDays: 90,
      enableAnalytics: true,
    });
    const synth = synthAllOn();
    const bucket = resourcesOf(synth, "google_logging_project_bucket_config").find(
      (b) => b.bucket_id === "vpn-logs-v2",
    );
    expect(bucket).toMatchObject({ retention_days: 90, enable_analytics: true });
  }, 120000);

  test.each([
    [
      "unknown Google log bucket",
      () => (googleVpnParams.logBucket = "missing"),
      /Log bucket "missing"/,
    ],
    [
      "Azure VPN logs without the workspace",
      () => {
        azureMonitorConfig.isEnabled = false;
        azureAcaEnvironmentDefaults.logs = false;
      },
      /Azure VPN gateway logs/,
    ],
    [
      "Container Apps logs without the workspace",
      () => {
        azureMonitorConfig.isEnabled = false;
        azureVpnparams.logs = false;
      },
      /Container Apps environment ".*" logs need/,
    ],
  ])("fails on %s", (_name, breakConfig, message) => {
    breakConfig();
    expect(() => synthAllOn()).toThrow(message);
  }, 120000);
});
