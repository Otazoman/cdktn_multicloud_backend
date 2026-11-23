/**
 * Alerting (FEAT-03): synthesizes the stack with example alerting configs
 * and checks that notification targets, alarms and their references are
 * created per cloud, and that `features.alerting` switches them off.
 */
import { awsAlertingConfig } from "../config/aws/monitoring";
import { azureAppGwConfigs } from "../config/azure/applicationgateway";
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
        notify: ["ops"],
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
        notify: ["ops"],
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
      vpnMode: "haBgp",
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

// These tests expect the plain HTTP Application Gateway, whatever the dev
// config builds (config/azure/applicationgateway.ts)
const appGwBuild = azureAppGwConfigs.map((c) => c.build);
beforeAll(() => {
  azureAppGwConfigs.forEach((c) => (c.build = c.name === "plain-http-appgw"));
});
afterAll(() => {
  azureAppGwConfigs.forEach((c, i) => (c.build = appGwBuild[i]));
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

describe("configured alerts (config/<cloud>/monitoring.ts)", () => {
  let synth: any;
  beforeAll(() => {
    synth = synthWith(true);
  }, 120000);

  test("AWS: API errors, journal job failures, 5xx and latency of the built ALB only", () => {
    const filters = resourcesOf(synth, "aws_cloudwatch_log_metric_filter");
    expect(filters.map((f) => f.pattern).sort()).toEqual(['"Journal pruning failed"', '"failed"']);
    const alarms = resourcesOf(synth, "aws_cloudwatch_metric_alarm");
    expect(alarms.map((a) => a.alarm_name).sort()).toEqual([
      "api-errors",
      "journal-prune-failed",
      "plain-http-alb-elb-5xx",
      "plain-http-alb-latency",
      "plain-http-alb-target-5xx",
    ]);
    const elb = alarms.find((a) => a.alarm_name === "plain-http-alb-elb-5xx");
    expect(elb.dimensions.LoadBalancer).toBe("${aws_lb.alb-plain-http-alb.arn_suffix}");
    // p95 of TargetResponseTime (seconds): a percentile, not a statistic
    const latency = alarms.find((a) => a.alarm_name === "plain-http-alb-latency");
    expect(latency).toMatchObject({ metric_name: "TargetResponseTime", extended_statistic: "p95", threshold: 1 });
    expect(latency.statistic).toBeUndefined();
    alarms.forEach((a) => expect(a.alarm_actions[0]).toContain("${aws_sns_topic."));
  });

  test("Google Cloud: log metrics and policies, 5xx and latency of the built load balancer only", () => {
    const policies = resourcesOf(synth, "google_monitoring_alert_policy");
    expect(policies.map((p) => p.display_name).sort()).toEqual([
      "api-errors",
      "cloud-build-failed",
      "cloud-build-succeeded",
      "journal-prune-failed",
      "run-regional-http-lb-5xx",
      "run-regional-http-lb-latency",
    ]);
    const latency = policies.find((p) => p.display_name === "run-regional-http-lb-latency");
    expect(latency.conditions[0].condition_threshold.filter).toContain("regional/total_latencies");
    expect(latency.conditions[0].condition_threshold.aggregations[0].per_series_aligner).toBe(
      "ALIGN_PERCENTILE_95",
    );
    const lb = policies.find((p) => p.display_name === "run-regional-http-lb-5xx");
    expect(lb.conditions[0].condition_threshold.filter).toContain(
      'forwarding_rule_name="run-regional-http-lb-http-fw"',
    );
    expect(resourcesOf(synth, "google_logging_metric").map((m) => m.name).sort()).toEqual([
      "api-errors",
      "journal-prune-failed",
    ]);
  });

  test("build results: CodeBuild through EventBridge, Cloud Build by log match", () => {
    const [rule] = resourcesOf(synth, "aws_cloudwatch_event_rule");
    expect(JSON.parse(rule.event_pattern)).toEqual({
      source: ["aws.codebuild"],
      "detail-type": ["CodeBuild Build State Change"],
      detail: { "project-name": ["api-service-cicd"], "build-status": ["SUCCEEDED", "FAILED", "STOPPED"] },
    });
    const [target] = resourcesOf(synth, "aws_cloudwatch_event_target");
    expect(target.arn).toContain("${aws_sns_topic.");
    expect(target.input_transformer.input_template).toContain("<status>");
    // The topic policy keeps the default statement (CloudWatch alarms)
    const [policy] = resourcesOf(synth, "aws_sns_topic_policy");
    expect(policy.policy).toContain("__default_statement_ID");
    expect(policy.policy).toContain("events.amazonaws.com");

    const policies = resourcesOf(synth, "google_monitoring_alert_policy").filter((p) =>
      p.display_name.startsWith("cloud-build-"),
    );
    policies.forEach((p) => {
      expect(p.conditions[0].condition_matched_log.filter).toContain('resource.type="build"');
      expect(p.alert_strategy.notification_rate_limit.period).toBe("300s");
    });
  });

  test("Azure: log alerts, and 5xx, unhealthy hosts and latency of the built Application Gateway", () => {
    const logAlerts = resourcesOf(synth, "azurerm_monitor_scheduled_query_rules_alert_v2");
    expect(logAlerts.map((a) => a.name).sort()).toEqual(["api-errors", "journal-prune-failed"]);
    const metricAlerts = resourcesOf(synth, "azurerm_monitor_metric_alert");
    expect(metricAlerts.map((a) => a.name).sort()).toEqual([
      "plain-http-appgw-5xx",
      "plain-http-appgw-latency",
      "plain-http-appgw-unhealthy-hosts",
    ]);
    metricAlerts.forEach((a) =>
      expect(a.scopes).toEqual(["${azurerm_application_gateway.appgw-plain-http-appgw.id}"]),
    );
    expect(metricAlerts.map((a) => a.criteria[0].metric_name).sort()).toEqual([
      "ApplicationGatewayTotalTime",
      "ResponseStatus",
      "UnhealthyHostCount",
    ]);
    // The operators the provider accepts (checked by Terraform, not by the types)
    metricAlerts.forEach((a) =>
      expect(["Equals", "GreaterThan", "GreaterThanOrEqual", "LessThan", "LessThanOrEqual"]).toContain(
        a.criteria[0].operator,
      ),
    );
    expect(metricAlerts[0].criteria[0].dimension).toEqual([
      { name: "HttpStatusGroup", operator: "Include", values: ["5xx"] },
    ]);
    const [group] = resourcesOf(synth, "azurerm_monitor_action_group");
    expect(group.short_name).toBe("ops");
  });
});

describe("uptime checks of /readyz (config/<cloud>/monitoring.ts uptimeCheck)", () => {
  const stageOriginal = process.env.BUILD_STAGE;
  afterEach(() => {
    process.env.BUILD_STAGE = stageOriginal;
  });

  test("the us-east-1 provider is declared at every stage (destroy runs at stage 1)", () => {
    process.env.BUILD_STAGE = "1";
    const synth = synthWith(true);
    expect(resourcesOf(synth, "aws_route53_health_check")).toHaveLength(0);
    expect(synth.provider.aws.find((p: any) => p.alias === "us-east-1")?.region).toBe("us-east-1");
  }, 120000);

  test("are not created before build stage 3 (the placeholder image has no /readyz)", () => {
    process.env.BUILD_STAGE = "2";
    const synth = synthWith(true);
    expect(resourcesOf(synth, "aws_route53_health_check")).toHaveLength(0);
    expect(resourcesOf(synth, "google_monitoring_uptime_check_config")).toHaveLength(0);
    expect(resourcesOf(synth, "azurerm_application_insights_standard_web_test")).toHaveLength(0);
    expect(resourcesOf(synth, "azurerm_application_insights")).toHaveLength(0);
  }, 120000);

  describe("at build stage 3", () => {
    let synth: any;
    beforeAll(() => {
      process.env.BUILD_STAGE = "3";
      synth = synthWith(true);
      process.env.BUILD_STAGE = stageOriginal;
    }, 120000);

    test("has no dependency cycle", () => {
      expect(findDependencyCycle(buildDependencyGraph(synth))).toBeUndefined();
    });

    test("AWS: a Route 53 health check per built ALB, alarmed in us-east-1", () => {
      const [check, ...others] = resourcesOf(synth, "aws_route53_health_check");
      expect(others).toHaveLength(0);
      expect(check).toMatchObject({
        type: "HTTP",
        port: 80,
        resource_path: "/readyz",
        request_interval: awsAlertingConfig.uptimeCheck.requestInterval,
        failure_threshold: awsAlertingConfig.uptimeCheck.failureThreshold,
      });
      // Checked with the main provider (global service)
      expect(check.provider).toBe("aws");

      const alarm = resourcesOf(synth, "aws_cloudwatch_metric_alarm").find(
        (a) => a.alarm_name === "plain-http-alb-uptime",
      );
      expect(alarm).toMatchObject({
        provider: "aws.us-east-1",
        namespace: "AWS/Route53",
        metric_name: "HealthCheckStatus",
        statistic: "Minimum",
        comparison_operator: "LessThanThreshold",
        threshold: 1,
      });
      expect(alarm.dimensions.HealthCheckId).toBe(
        "${aws_route53_health_check.route53-health-check-plain-http-alb.id}",
      );
      // Its SNS topic and email subscriptions are in us-east-1 too
      const topics = resourcesOf(synth, "aws_sns_topic").filter((t) => t.provider === "aws.us-east-1");
      expect(topics).toHaveLength(1);
      expect(alarm.alarm_actions).toEqual(["${aws_sns_topic.sns-topic-ops-us-east-1.arn}"]);
      expect(synth.provider.aws.find((p: any) => p.alias === "us-east-1").region).toBe("us-east-1");
    });

    test("Google Cloud: an uptime check per built load balancer, alerted on failing regions", () => {
      const [check, ...others] = resourcesOf(synth, "google_monitoring_uptime_check_config");
      expect(others).toHaveLength(0);
      expect(check.monitored_resource.type).toBe("uptime_url");
      expect(check.http_check).toMatchObject({ path: "/readyz", port: 80, use_ssl: false });
      expect(check.period).toBe(googleAlertingConfig.uptimeCheck.period);

      const policy = resourcesOf(synth, "google_monitoring_alert_policy").find(
        (p) => p.display_name === "run-regional-http-lb-uptime",
      );
      const condition = policy.conditions[0].condition_threshold;
      expect(condition.filter).toContain("uptime_check/check_passed");
      expect(condition.filter).toContain(
        "${google_monitoring_uptime_check_config.gcp-uptime-check-run-regional-http-lb.uptime_check_id}",
      );
      expect(condition.aggregations[0].cross_series_reducer).toBe("REDUCE_COUNT_FALSE");
      expect(condition.threshold_value).toBe(googleAlertingConfig.uptimeCheck.failedRegionsAbove);
    });

    test("Azure: Application Insights, a standard test per built gateway, and a location alert", () => {
      const [insights] = resourcesOf(synth, "azurerm_application_insights");
      expect(insights.workspace_id).toContain("${azurerm_log_analytics_workspace.");
      const [test, ...others] = resourcesOf(synth, "azurerm_application_insights_standard_web_test");
      expect(others).toHaveLength(0);
      expect(test.request.url).toMatch(/^http:\/\/.+\/readyz$/);
      // The first locationCount candidates
      const { geoLocations, locationCount } = azureAlertingConfig.uptimeCheck;
      expect(test.geo_locations).toEqual(geoLocations.slice(0, locationCount));

      const alert = resourcesOf(synth, "azurerm_monitor_metric_alert").find(
        (a) => a.name === "plain-http-appgw-uptime",
      );
      expect(alert.criteria).toBeUndefined();
      expect(alert.application_insights_web_test_location_availability_criteria.failed_location_count).toBe(
        azureAlertingConfig.uptimeCheck.failedLocationCount,
      );
      expect(alert.scopes).toHaveLength(2);
      expect(alert.action[0].action_group_id).toContain("${azurerm_monitor_action_group.");
    });
  });

  test.each([
    [{ locationCount: 5, failedLocationCount: 3 }, undefined],
    [{ locationCount: 0 }, "locationCount must be 1 to"],
    [{ locationCount: 99 }, "locationCount must be 1 to"],
    [{ locationCount: 3, failedLocationCount: 4 }, "the alert never fires"],
    [{ failedLocationCount: 0 }, "failedLocationCount must be 1 to"],
    [{ frequency: 120 }, "frequency must be 300, 600 or 900"],
    [{ geoLocations: ["apac-jp-kaw-edge", "apac-jp-kaw-edge"], locationCount: 1, failedLocationCount: 1 }, "duplicates"],
  ])("Azure availability test settings %j", (change, error) => {
    const original = { ...azureAlertingConfig.uptimeCheck };
    process.env.BUILD_STAGE = "3";
    try {
      Object.assign(azureAlertingConfig.uptimeCheck, change);
      if (error) {
        expect(() => synthWith(true)).toThrow(error);
      } else {
        const [test] = resourcesOf(synthWith(true), "azurerm_application_insights_standard_web_test");
        expect(test.geo_locations).toHaveLength(5);
        const alert = resourcesOf(synthWith(true), "azurerm_monitor_metric_alert").find(
          (a) => a.name === "plain-http-appgw-uptime",
        );
        expect(alert.application_insights_web_test_location_availability_criteria.failed_location_count).toBe(3);
      }
    } finally {
      Object.assign(azureAlertingConfig.uptimeCheck, original);
    }
  }, 120000);

  test("each check and each alert can be switched off", () => {
    const originals = {
      aws: awsAlertingConfig.uptimeCheck.enabled,
      google: googleAlertingConfig.uptimeCheck.enabled,
      azure: azureAlertingConfig.uptimeCheck.enabled,
    };
    const latencyAlarms = [
      ...awsAlertingConfig.alarms,
      ...googleAlertingConfig.alertPolicies,
      ...azureAlertingConfig.metricAlerts,
    ].filter((a: any) => "enabled" in a);
    process.env.BUILD_STAGE = "3";
    try {
      awsAlertingConfig.uptimeCheck.enabled = false;
      googleAlertingConfig.uptimeCheck.enabled = false;
      azureAlertingConfig.uptimeCheck.enabled = false;
      latencyAlarms.forEach((a: any) => (a.enabled = false));
      const synth = synthWith(true);
      expect(resourcesOf(synth, "aws_route53_health_check")).toHaveLength(0);
      expect(resourcesOf(synth, "google_monitoring_uptime_check_config")).toHaveLength(0);
      expect(resourcesOf(synth, "azurerm_application_insights")).toHaveLength(0);
      const names = [
        ...resourcesOf(synth, "aws_cloudwatch_metric_alarm").map((a) => a.alarm_name),
        ...resourcesOf(synth, "google_monitoring_alert_policy").map((p) => p.display_name),
        ...resourcesOf(synth, "azurerm_monitor_metric_alert").map((a) => a.name),
      ];
      expect(names.filter((n) => /latency|unhealthy|uptime/.test(n))).toEqual([]);
      // The other alerts stay
      expect(names).toContain("plain-http-alb-elb-5xx");
    } finally {
      awsAlertingConfig.uptimeCheck.enabled = originals.aws;
      googleAlertingConfig.uptimeCheck.enabled = originals.google;
      azureAlertingConfig.uptimeCheck.enabled = originals.azure;
      latencyAlarms.forEach((a: any) => (a.enabled = true));
    }
  }, 120000);
});
