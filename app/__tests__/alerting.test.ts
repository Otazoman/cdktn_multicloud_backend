/**
 * Alerting (FEAT-03): synthesizes the stack with example alerting configs
 * and checks that notification targets, alarms and their references are
 * created per cloud, and that `features.alerting` switches them off.
 */
import { awsAlertingConfig } from "../config/aws/monitoring";
import { azureAlertingConfig } from "../config/azure/azuremonitor";
import { googleAlertingConfig } from "../config/google/monitoring";
import {
  FEATURE_SETS,
  buildDependencyGraph,
  findDependencyCycle,
  synthCase,
} from "../scripts/dev/synthMatrix";

const resourcesOf = (synth: any, type: string): any[] =>
  Object.values(synth.resource?.[type] ?? {});

const exampleConfigs = () => ({
  aws: {
    notificationTargets: [
      { key: "ops", emails: ["ops@example.com", "dev@example.com"] },
    ],
    metricFilters: [
      {
        name: "api-service-errors",
        logGroupName: "/aws/ecs/api-service",
        pattern: '"ERROR"',
        metricName: "ApiServiceErrors",
        metricNamespace: "Custom/ECS",
      },
    ],
    alarms: [
      {
        alarmName: "ecs-api-service-cpu-high",
        namespace: "AWS/ECS",
        metricName: "CPUUtilization",
        dimensions: { ClusterName: "main-cluster", ServiceName: "api-service" },
        statistic: "Average",
        comparisonOperator: "GreaterThanThreshold" as const,
        threshold: 80,
        period: 300,
        evaluationPeriods: 2,
        notify: ["ops"],
        notifyOnOk: true,
      },
      {
        alarmName: "ecs-api-service-errors",
        namespace: "Custom/ECS",
        metricName: "ApiServiceErrors",
        statistic: "Sum",
        comparisonOperator: "GreaterThanThreshold" as const,
        threshold: 0,
        period: 300,
        evaluationPeriods: 1,
        notify: ["ops"],
      },
    ],
  },
  google: {
    notificationTargets: [{ key: "ops", emails: ["ops@example.com"] }],
    logMetrics: [
      {
        name: "cloud-run-errors",
        filter: 'resource.type="cloud_run_revision" AND severity>=ERROR',
      },
    ],
    alertPolicies: [
      {
        displayName: "cloud-run-errors",
        combiner: "OR" as const,
        conditionFilter:
          'metric.type="logging.googleapis.com/user/cloud-run-errors" AND resource.type="cloud_run_revision"',
        aggregation: { perSeriesAligner: "ALIGN_SUM", alignmentPeriod: "300s" },
        duration: "0s",
        comparison: "COMPARISON_GT" as const,
        thresholdValue: 0,
        notify: ["ops"],
      },
    ],
  },
  azure: {
    logAlerts: [
      {
        name: "aca-console-errors",
        query: 'ContainerAppConsoleLogs | where Log has "ERROR"',
        severity: 2,
        evaluationFrequency: "PT5M",
        windowDuration: "PT5M",
        timeAggregationMethod: "Count" as const,
        operator: "GreaterThan" as const,
        threshold: 0,
        notify: ["devops"],
      },
    ],
    metricAlerts: [
      {
        name: "aca-backend-cpu-high",
        target: { type: "containerApp" as const, name: "backend-api-service" },
        metricNamespace: "Microsoft.App/containerApps",
        metricName: "UsageNanoCores",
        aggregation: "Average" as const,
        operator: "GreaterThan" as const,
        threshold: 200000000,
        frequency: "PT5M",
        windowSize: "PT15M",
        notify: ["devops"],
      },
    ],
  },
});

const allOn = FEATURE_SETS.allOn as { clouds: Record<string, any> };

const synthWith = (alerting: boolean) =>
  synthCase({
    name: `alerting=${alerting}`,
    overrides: {
      ...allOn,
      env: "prod",
      awsToGoogle: false,
      awsToAzure: true,
      googleToAzure: true,
      clouds: Object.fromEntries(
        Object.entries(allOn.clouds).map(([cloud, settings]) => [
          cloud,
          { ...settings, features: { ...settings.features, alerting } },
        ]),
      ),
    },
  });

describe("alerting", () => {
  const originals = {
    aws: { ...awsAlertingConfig },
    google: { ...googleAlertingConfig },
    azure: { ...azureAlertingConfig },
  };

  beforeEach(() => {
    const examples = exampleConfigs();
    Object.assign(awsAlertingConfig, examples.aws);
    Object.assign(googleAlertingConfig, examples.google);
    Object.assign(azureAlertingConfig, examples.azure);
  });

  afterEach(() => {
    Object.assign(awsAlertingConfig, originals.aws);
    Object.assign(googleAlertingConfig, originals.google);
    Object.assign(azureAlertingConfig, originals.azure);
  });

  describe("enabled", () => {
    let synth: any;
    beforeEach(() => {
      synth = synthWith(true);
    }, 120000);

    test("has no dependency cycle", () => {
      expect(findDependencyCycle(buildDependencyGraph(synth))).toBeUndefined();
    });

    test("AWS: SNS topic, subscriptions, metric filter and alarms", () => {
      const topics = resourcesOf(synth, "aws_sns_topic");
      expect(topics.map((t) => t.name)).toEqual([
        expect.stringMatching(/-aws-alerts-ops$/),
      ]);
      const subscriptions = resourcesOf(synth, "aws_sns_topic_subscription");
      expect(subscriptions.map((s) => s.endpoint).sort()).toEqual([
        "dev@example.com",
        "ops@example.com",
      ]);
      subscriptions.forEach((s) => {
        expect(s.protocol).toBe("email");
        expect(s.topic_arn).toContain("${aws_sns_topic.");
      });

      const [filter] = resourcesOf(synth, "aws_cloudwatch_log_metric_filter");
      expect(filter.log_group_name).toContain("${aws_cloudwatch_log_group.");

      const alarms = resourcesOf(synth, "aws_cloudwatch_metric_alarm");
      expect(alarms).toHaveLength(2);
      const cpu = alarms.find((a) => a.alarm_name === "ecs-api-service-cpu-high");
      expect(cpu.dimensions).toEqual({
        ClusterName: "main-cluster",
        ServiceName: "api-service",
      });
      expect(cpu.ok_actions).toEqual(cpu.alarm_actions);
      alarms.forEach((a) => {
        expect(a.alarm_actions).toEqual([
          expect.stringContaining("${aws_sns_topic."),
        ]);
      });
      const errors = alarms.find((a) => a.alarm_name === "ecs-api-service-errors");
      expect(errors.ok_actions).toBeUndefined();
      expect(errors.depends_on).toEqual([
        expect.stringContaining("aws_cloudwatch_log_metric_filter."),
      ]);
    });

    test("Google: notification channel, log metric and alert policy", () => {
      const channels = resourcesOf(
        synth,
        "google_monitoring_notification_channel",
      );
      expect(channels).toHaveLength(1);
      expect(channels[0].type).toBe("email");
      expect(channels[0].labels).toEqual({ email_address: "ops@example.com" });

      expect(resourcesOf(synth, "google_logging_metric")).toHaveLength(1);

      const [policy] = resourcesOf(synth, "google_monitoring_alert_policy");
      expect(policy.notification_channels).toEqual([
        expect.stringContaining("${google_monitoring_notification_channel."),
      ]);
      expect(
        policy.conditions[0].condition_threshold.aggregations[0],
      ).toMatchObject({ per_series_aligner: "ALIGN_SUM", alignment_period: "300s" });
      expect(policy.depends_on).toEqual(
        expect.arrayContaining([expect.stringContaining("google_logging_metric.")]),
      );
    });

    test("Azure: action group, v2 log alert and metric alert", () => {
      expect(resourcesOf(synth, "azurerm_monitor_action_group")).toHaveLength(1);
      expect(
        resourcesOf(synth, "azurerm_monitor_scheduled_query_rules_alert"),
      ).toHaveLength(0);

      const [logAlert] = resourcesOf(
        synth,
        "azurerm_monitor_scheduled_query_rules_alert_v2",
      );
      expect(logAlert.scopes).toEqual([
        expect.stringContaining("${azurerm_log_analytics_workspace."),
      ]);
      expect(logAlert.criteria[0]).toMatchObject({
        time_aggregation_method: "Count",
        operator: "GreaterThan",
        threshold: 0,
      });
      expect(logAlert.action.action_groups).toEqual([
        expect.stringContaining("${azurerm_monitor_action_group."),
      ]);

      const [metricAlert] = resourcesOf(synth, "azurerm_monitor_metric_alert");
      expect(metricAlert.scopes).toEqual([
        expect.stringContaining("${azurerm_container_app."),
      ]);
      expect(metricAlert.action).toEqual([
        { action_group_id: expect.stringContaining("${azurerm_monitor_action_group.") },
      ]);
    });
  });

  test("nothing is created when alerting is disabled", () => {
    const synth = synthWith(false);
    for (const type of [
      "aws_sns_topic",
      "aws_sns_topic_subscription",
      "aws_cloudwatch_log_metric_filter",
      "aws_cloudwatch_metric_alarm",
      "google_monitoring_notification_channel",
      "google_logging_metric",
      "google_monitoring_alert_policy",
      "azurerm_monitor_action_group",
      "azurerm_monitor_scheduled_query_rules_alert_v2",
      "azurerm_monitor_metric_alert",
    ]) {
      expect(resourcesOf(synth, type)).toHaveLength(0);
    }
    // The workspace does not depend on alerting
    expect(resourcesOf(synth, "azurerm_log_analytics_workspace")).toHaveLength(1);
  }, 120000);

  test.each([
    [
      "unknown AWS notification target",
      () => (awsAlertingConfig.alarms[0].notify = ["missing"]),
      /Notification target "missing"/,
    ],
    [
      "unknown AWS log group",
      () => (awsAlertingConfig.metricFilters[0].logGroupName = "/missing"),
      /CloudWatch Log Group "\/missing"/,
    ],
    [
      "unknown Google notification target",
      () => (googleAlertingConfig.alertPolicies[0].notify = ["missing"]),
      /Notification target "missing"/,
    ],
    [
      "unknown Azure notification target",
      () => (azureAlertingConfig.logAlerts[0].notify = ["missing"]),
      /Notification target "missing"/,
    ],
    [
      "unknown Container App",
      () => (azureAlertingConfig.metricAlerts[0].target = { type: "containerApp", name: "missing" }),
      /Container App "missing"/,
    ],
  ])("fails on %s", (_name, breakConfig, message) => {
    breakConfig();
    expect(() => synthWith(true)).toThrow(message);
  }, 120000);
});
