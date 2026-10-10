/**
 * Autoscaling (FEAT-03 step 6): ECS target tracking (CPU / memory / ALB
 * requests per target), Cloud Run concurrency and Container Apps scale rules.
 */
import { awsEcsConfigs } from "../config/aws/ecs";
import { azureAcaConfigs } from "../config/azure/containerapps";
import { gcpRunConfigs } from "../config/google/cloudrun";
import { FEATURE_SETS, synthCase } from "../scripts/dev/synthMatrix";

const resourcesOf = (synth: any, type: string): any[] =>
  Object.values(synth.resource?.[type] ?? {});

const synthAllOn = () =>
  synthCase({
    name: "autoscaling",
    overrides: {
      ...FEATURE_SETS.allOn,
      env: "prod",
      awsToGoogle: true,
      awsToAzure: true,
      googleToAzure: true,
    },
  });

const [apiService, workerService] = awsEcsConfigs;
const mutable: object[] = [...awsEcsConfigs, ...gcpRunConfigs, ...azureAcaConfigs];
const snapshots = mutable.map((o) => structuredClone(o));

afterEach(() => {
  mutable.forEach((o, i) => {
    Object.keys(o).forEach((k) => delete (o as any)[k]);
    Object.assign(o, structuredClone(snapshots[i]));
  });
});

test("defaults keep the current scaling", () => {
  const synth = synthAllOn();
  const policies = resourcesOf(synth, "aws_appautoscaling_policy").map(
    (p) =>
      p.target_tracking_scaling_policy_configuration.predefined_metric_specification
        .predefined_metric_type,
  );
  expect(policies).not.toContain("ALBRequestCountPerTarget");
  expect(policies).toContain("ECSServiceAverageCPUUtilization");

  resourcesOf(synth, "google_cloud_run_v2_service").forEach((s) =>
    expect(s.template.max_instance_request_concurrency).toBeUndefined(),
  );
  resourcesOf(synth, "azurerm_container_app").forEach((app) => {
    expect(app.template).toMatchObject({ min_replicas: 0, max_replicas: 10 });
    expect(app.template.http_scale_rule).toBeUndefined();
    expect(app.template.custom_scale_rule).toBeUndefined();
  });
}, 120000);

test("ECS: ALB requests per target for a rolling service", () => {
  Object.assign(apiService, { deploymentStrategy: "ROLLING" });
  Object.assign(apiService.autoScaling, { requestCountPerTarget: 500 });
  const synth = synthAllOn();
  const policy = resourcesOf(synth, "aws_appautoscaling_policy").find(
    (p) =>
      p.target_tracking_scaling_policy_configuration.predefined_metric_specification
        .predefined_metric_type === "ALBRequestCountPerTarget",
  );
  expect(policy.name).toMatch(/-aws-ecs-req-scaling-api-service$/);
  const config = policy.target_tracking_scaling_policy_configuration;
  expect(config.target_value).toBe(500);
  expect(config.predefined_metric_specification.resource_label).toMatch(
    /^\$\{aws_lb\..+\.arn_suffix\}\/\$\{aws_lb_target_group\..+\.arn_suffix\}$/,
  );
}, 120000);

test.each([
  [
    "blue/green deployment",
    () => Object.assign(apiService.autoScaling, { requestCountPerTarget: 500 }),
    /only supported with the ROLLING deployment strategy/,
  ],
  [
    "target group without an ALB",
    () => Object.assign(workerService.autoScaling, { requestCountPerTarget: 500 }),
    /needs the target group "managed-worker-tg"/,
  ],
])("ECS request scaling fails on %s", (_name, breakConfig, message) => {
  breakConfig();
  expect(() => synthAllOn()).toThrow(message);
}, 120000);

test("Cloud Run: max concurrent requests per instance", () => {
  Object.assign(gcpRunConfigs[0], { maxInstanceRequestConcurrency: 40 });
  const synth = synthAllOn();
  const service = resourcesOf(synth, "google_cloud_run_v2_service").find(
    (s) => s.name === gcpRunConfigs[0].name,
  );
  expect(service.template.max_instance_request_concurrency).toBe(40);
}, 120000);

test("Container Apps: replicas and scale rules", () => {
  const app = azureAcaConfigs.find((c) => c.build)!;
  Object.assign(app, {
    minReplicas: 1,
    maxReplicas: 5,
    scaleRules: [
      { type: "http", name: "http-scale", concurrentRequests: 50 },
      { type: "tcp", name: "tcp-scale", concurrentRequests: 20 },
      { type: "cpu", name: "cpu-scale", utilization: 70 },
      { type: "memory", name: "mem-scale", utilization: 80 },
    ],
  });
  const synth = synthAllOn();
  const created = resourcesOf(synth, "azurerm_container_app").find((a) => a.name === app.name);
  expect(created.template).toMatchObject({
    min_replicas: 1,
    max_replicas: 5,
    http_scale_rule: [{ name: "http-scale", concurrent_requests: "50" }],
    tcp_scale_rule: [{ name: "tcp-scale", concurrent_requests: "20" }],
    custom_scale_rule: [
      { name: "cpu-scale", custom_rule_type: "cpu", metadata: { type: "Utilization", value: "70" } },
      { name: "mem-scale", custom_rule_type: "memory", metadata: { type: "Utilization", value: "80" } },
    ],
  });
}, 120000);
