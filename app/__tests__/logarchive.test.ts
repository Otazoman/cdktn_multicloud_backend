/**
 * Log archive (FEAT-03 step 5): S3 (Firehose / export), Cloud Storage (log
 * sink) and Azure Storage (diagnostic settings), switched by
 * `features.logArchive`.
 */
import { awsLogArchiveConfig } from "../config/aws/monitoring";
import { azureLogArchiveConfig } from "../config/azure/azuremonitor";
import { azureAcaEnvironmentSettings } from "../config/azure/containerapps";
import { googleLogArchiveConfig } from "../config/google/monitoring";
import {
  FEATURE_SETS,
  buildDependencyGraph,
  findDependencyCycle,
  synthCase,
} from "../scripts/dev/synthMatrix";

const resourcesOf = (synth: any, type: string): any[] =>
  Object.values(synth.resource?.[type] ?? {});

const allOn = FEATURE_SETS.allOn as { clouds: Record<string, any> };

const synthWith = (logArchive: boolean) =>
  synthCase({
    name: `logArchive=${logArchive}`,
    overrides: {
      ...allOn,
      env: "prod",
      awsToGoogle: true,
      awsToAzure: true,
      googleToAzure: true,
      clouds: Object.fromEntries(
        Object.entries(allOn.clouds).map(([cloud, settings]) => [
          cloud,
          { ...settings, features: { ...settings.features, logArchive } },
        ]),
      ),
    },
  });

const configs: object[] = [
  awsLogArchiveConfig,
  googleLogArchiveConfig,
  azureLogArchiveConfig,
  azureAcaEnvironmentSettings,
];
const originals = configs.map((c) => structuredClone(c));

beforeEach(() => {
  awsLogArchiveConfig.bucket.name = "example-aws-log-archive";
  googleLogArchiveConfig.bucket.name = "example-google-log-archive";
  azureLogArchiveConfig.storageAccount.name = "examplelogarchive";
});

afterEach(() => {
  configs.forEach((c, i) => {
    Object.keys(c).forEach((k) => delete (c as any)[k]);
    Object.assign(c, structuredClone(originals[i]));
  });
});

// Azure Files creates its own storage account; find the archive one by name.
const archiveAccounts = (synth: any) =>
  resourcesOf(synth, "azurerm_storage_account").filter(
    (a) => a.name === azureLogArchiveConfig.storageAccount.name,
  );

const archiveTypes = [
  "aws_s3_bucket",
  "aws_kinesis_firehose_delivery_stream",
  "aws_cloudwatch_log_subscription_filter",
  "aws_lambda_function",
  "aws_scheduler_schedule",
  "google_storage_bucket",
  "azurerm_storage_management_policy",
];

test("nothing is archived when logArchive is disabled", () => {
  const synth = synthWith(false);
  archiveTypes.forEach((type) => expect(resourcesOf(synth, type)).toHaveLength(0));
  expect(archiveAccounts(synth)).toHaveLength(0);
  resourcesOf(synth, "azurerm_monitor_diagnostic_setting").forEach((s) =>
    expect(s.storage_account_id).toBeUndefined(),
  );
}, 120000);

describe("enabled (defaults: firehose, deleteOnDestroy)", () => {
  let synth: any;
  beforeEach(() => {
    synth = synthWith(true);
  }, 120000);

  test("has no dependency cycle", () => {
    expect(findDependencyCycle(buildDependencyGraph(synth))).toBeUndefined();
  });

  test("AWS: S3 bucket and one Firehose stream per log group", () => {
    const [bucket] = resourcesOf(synth, "aws_s3_bucket");
    expect(bucket).toMatchObject({ bucket: "example-aws-log-archive", force_destroy: true });
    expect(resourcesOf(synth, "aws_s3_bucket_public_access_block")[0]).toMatchObject({
      block_public_acls: true,
      block_public_policy: true,
      ignore_public_acls: true,
      restrict_public_buckets: true,
    });
    const [lifecycle] = resourcesOf(synth, "aws_s3_bucket_lifecycle_configuration");
    expect(lifecycle.rule[0]).toMatchObject({
      status: "Enabled",
      transition: [{ days: 30, storage_class: "GLACIER" }],
      expiration: [{ days: 365 }],
    });

    const streams = resourcesOf(synth, "aws_kinesis_firehose_delivery_stream");
    expect(streams.map((s) => s.extended_s3_configuration.prefix).sort()).toEqual([
      "aws-ecs-api-service/",
      "aws-ecs-worker-service/",
    ]);
    const filters = resourcesOf(synth, "aws_cloudwatch_log_subscription_filter");
    expect(filters).toHaveLength(2);
    filters.forEach((f) => {
      expect(f.log_group_name).toContain("${aws_cloudwatch_log_group.");
      expect(f.destination_arn).toContain("${aws_kinesis_firehose_delivery_stream.");
      expect(f.filter_pattern).toBe("");
    });
    expect(resourcesOf(synth, "aws_lambda_function")).toHaveLength(0);
  });

  test("Google: Cloud Storage bucket, sink and writer permission", () => {
    const [bucket] = resourcesOf(synth, "google_storage_bucket");
    expect(bucket).toMatchObject({
      name: "example-google-log-archive",
      force_destroy: true,
      uniform_bucket_level_access: true,
      public_access_prevention: "enforced",
    });
    expect(bucket.lifecycle_rule).toEqual([
      { condition: { age: 30 }, action: { type: "SetStorageClass", storage_class: "ARCHIVE" } },
      { condition: { age: 365 }, action: { type: "Delete" } },
    ]);
    const sink = resourcesOf(synth, "google_logging_project_sink").find((s) =>
      s.destination.startsWith("storage.googleapis.com/"),
    );
    expect(sink.unique_writer_identity).toBe(true);
    expect(sink.filter).toBe(
      'resource.type="cloud_run_revision" AND (' +
        'resource.labels.service_name="web-service-with-lb" OR ' +
        'resource.labels.service_name="web-service-standalone")',
    );
    const [writer] = resourcesOf(synth, "google_storage_bucket_iam_member");
    expect(writer.role).toBe("roles/storage.objectCreator");
    expect(writer.member).toContain(".writer_identity}");
  });

  test("Azure: storage account, lifecycle policy and diagnostic settings", () => {
    const [account] = archiveAccounts(synth);
    expect(account).toMatchObject({
      name: "examplelogarchive",
      account_replication_type: "LRS",
      https_traffic_only_enabled: true,
      min_tls_version: "TLS1_2",
      infrastructure_encryption_enabled: false,
      allow_nested_items_to_be_public: false,
    });
    expect(account.lifecycle).toBeUndefined();
    const [policy] = resourcesOf(synth, "azurerm_storage_management_policy");
    expect(policy.rule[0].actions.base_blob).toEqual({
      tier_to_cool_after_days_since_modification_greater_than: 30,
      tier_to_archive_after_days_since_modification_greater_than: 90,
      delete_after_days_since_modification_greater_than: 365,
    });
    const acaSettings = resourcesOf(synth, "azurerm_monitor_diagnostic_setting").filter(
      (s) => s.target_resource_id.includes("azurerm_container_app_environment"),
    );
    expect(acaSettings.length).toBeGreaterThan(0);
    acaSettings.forEach((s) =>
      expect(s.storage_account_id).toContain("${azurerm_storage_account."),
    );
  });
});

test("AWS export mode: scheduled Lambda instead of Firehose", () => {
  awsLogArchiveConfig.mode = "export";
  const synth = synthWith(true);
  expect(resourcesOf(synth, "aws_kinesis_firehose_delivery_stream")).toHaveLength(0);
  expect(resourcesOf(synth, "aws_cloudwatch_log_subscription_filter")).toHaveLength(0);

  const [lambda] = resourcesOf(synth, "aws_lambda_function");
  expect(lambda).toMatchObject({ runtime: "python3.12", handler: "index.handler", timeout: 900 });
  expect(lambda.filename).toMatch(/archive\.zip$/);
  expect(JSON.parse(lambda.environment.variables.LOG_GROUPS)).toEqual([
    { name: expect.stringContaining("${aws_cloudwatch_log_group."), prefix: "aws-ecs-api-service" },
    { name: expect.stringContaining("${aws_cloudwatch_log_group."), prefix: "aws-ecs-worker-service" },
  ]);
  expect(lambda.logging_config.log_group).toContain("${aws_cloudwatch_log_group.aws-log-archive-lambda-log-group");

  const [schedule] = resourcesOf(synth, "aws_scheduler_schedule");
  expect(schedule).toMatchObject({
    schedule_expression: "cron(0 2 * * ? *)",
    schedule_expression_timezone: "Asia/Tokyo",
    flexible_time_window: { mode: "OFF" },
  });
  const [bucketPolicy] = resourcesOf(synth, "aws_s3_bucket_policy");
  expect(bucketPolicy.policy).toContain("logs.");
  expect(findDependencyCycle(buildDependencyGraph(synth))).toBeUndefined();
}, 120000);

test("Azure infrastructure (double) encryption", () => {
  azureLogArchiveConfig.storageAccount.infrastructureEncryption = true;
  const synth = synthWith(true);
  expect(archiveAccounts(synth)[0].infrastructure_encryption_enabled).toBe(true);
}, 120000);

test("deleteOnDestroy: false keeps the archives", () => {
  awsLogArchiveConfig.deleteOnDestroy = false;
  googleLogArchiveConfig.deleteOnDestroy = false;
  azureLogArchiveConfig.deleteOnDestroy = false;
  const synth = synthWith(true);
  expect(resourcesOf(synth, "aws_s3_bucket")[0].force_destroy).toBe(false);
  expect(resourcesOf(synth, "google_storage_bucket")[0].force_destroy).toBe(false);
  expect(archiveAccounts(synth)[0].lifecycle).toEqual({
    prevent_destroy: true,
  });
}, 120000);

test.each([
  ["missing S3 bucket name", () => (awsLogArchiveConfig.bucket.name = undefined), /awsLogArchiveConfig.bucket.name/],
  ["unknown log group", () => (awsLogArchiveConfig.logGroups = ["/missing"]), /CloudWatch Log Group "\/missing"/],
  ["missing GCS bucket name", () => (googleLogArchiveConfig.bucket.name = undefined), /googleLogArchiveConfig.bucket.name/],
  [
    "unknown Cloud Run service",
    () => (googleLogArchiveConfig.cloudRunServices = ["missing"]),
    /Cloud Run service "missing"/,
  ],
  [
    "missing storage account name",
    () => (azureLogArchiveConfig.storageAccount.name = undefined),
    /azureLogArchiveConfig.storageAccount.name/,
  ],
  [
    "invalid storage account name",
    () => (azureLogArchiveConfig.storageAccount.name = "Invalid-Name"),
    /must be 3-24 lowercase letters and digits/,
  ],
  [
    "archived environment without logs",
    () => {
      azureLogArchiveConfig.acaEnvironments = ["main-env"];
      azureAcaEnvironmentSettings["main-env"] = { logs: false };
    },
    /"main-env" in azureLogArchiveConfig.acaEnvironments has logs: false/,
  ],
])("fails on %s", (_name, breakConfig, message) => {
  breakConfig();
  expect(() => synthWith(true)).toThrow(message);
}, 120000);
