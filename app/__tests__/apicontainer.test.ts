import { apiContainerConfig } from "../config/apicontainer";
import { FEATURE_SETS, synthCase } from "../scripts/dev/synthMatrix";

const resourcesOf = (synth: any, type: string): Record<string, any> =>
  synth.resource?.[type] ?? {};

const allFeaturesOn = (FEATURE_SETS.allOn.clouds as any).aws;

/** Synthesizes every cloud and feature with the given API flags. */
const synthWith = (
  flags: Partial<typeof apiContainerConfig> = {},
  overrides: Record<string, unknown> = FEATURE_SETS.allOn,
) => {
  const original = { ...apiContainerConfig };
  // The tests describe a cluster unless they set the topology
  Object.assign(apiContainerConfig, { topology: "cluster" }, flags);
  try {
    return synthCase({ name: "apicontainer", overrides });
  } finally {
    Object.assign(apiContainerConfig, original);
  }
};

const ecsContainer = (synth: any, family: string) => {
  const taskDef = Object.values(resourcesOf(synth, "aws_ecs_task_definition")).find(
    (t) => t.family === family,
  );
  return JSON.parse(taskDef.container_definitions)[0];
};

const envOf = (env: { name: string; value?: string }[] | undefined) =>
  Object.fromEntries((env ?? []).filter((e) => e.value !== undefined).map((e) => [e.name, e.value]));

describe("API container (config/apicontainer.ts)", () => {
  describe("defaults", () => {
    let synth: any;
    beforeAll(() => {
      synth = synthWith();
    });

    test("ECS: the CI/CD deploy target gets every node and the password secret", () => {
      const container = ecsContainer(synth, "api-service");
      expect(envOf(container.environment)).toEqual({
        CLOUD_ID: "aws",
        // Its own database by the database's endpoint, the others by private DNS
        DB_HOST: "${aws_rds_cluster.auroraCluster-aurora-postgres-cluster.endpoint}",
        DB_NAME: "appdb",
        DB_USER: "app_api",
        DB_SSLMODE: "require",
        PEER_NODES: "google,azure",
        DB_GOOGLE_HOST: "cloudsql-postgres.google.inner",
        DB_AZURE_HOST: "postgres-prod.azure.inner",
      });
      expect(container.secrets).toEqual(
        ["DB_PASSWORD", "DB_GOOGLE_PASSWORD", "DB_AZURE_PASSWORD"].map((name) => ({
          name,
          valueFrom: "${aws_secretsmanager_secret.aws-secret-db-api-password.arn}",
        })),
      );
      // Other services are unchanged
      expect(envOf(ecsContainer(synth, "worker-service").environment)).not.toHaveProperty("CLOUD_ID");

      const policies = Object.values(resourcesOf(synth, "aws_iam_role_policy")).filter((p) =>
        p.policy.includes("secretsmanager:GetSecretValue"),
      );
      expect(policies).toHaveLength(1);
      expect(policies[0].policy).toContain("aws-secret-db-api-password");
    });

    test("ECS: CodeBuild knows the task definition family", () => {
      const project = Object.values(resourcesOf(synth, "aws_codebuild_project"))[0];
      expect(project.environment.environment_variable).toContainEqual({
        name: "TASK_FAMILY",
        value: "api-service",
        type: "PLAINTEXT",
      });
    });

    test("ALB: the API target groups check / until readinessProbe", () => {
      const groups = Object.values(resourcesOf(synth, "aws_lb_target_group")).filter((g) =>
        String(g.name).includes("managed-api-tg"),
      );
      expect(groups.length).toBeGreaterThan(0);
      groups.forEach((g) => expect(g.health_check.path).toBe("/"));
    });

    test("Cloud Run: env, the secret and access for the runtime service account; no probes", () => {
      const service = resourcesOf(synth, "google_cloud_run_v2_service")["run-web-service-with-lb"];
      const container = service.template.containers[0];
      expect(envOf(container.env)).toMatchObject({
        CLOUD_ID: "google",
        DB_HOST: expect.stringMatching(/^\$\{google_sql_database_instance\..*\.private_ip_address\}$/),
        PEER_NODES: "aws,azure",
        DB_AWS_HOST: "aurora-postgres.aws.inner",
        DB_AZURE_HOST: "postgres-prod.azure.inner",
      });
      const secretEnv = container.env.filter((e: any) => e.value_source);
      expect(secretEnv.map((e: any) => e.name)).toEqual([
        "DB_PASSWORD",
        "DB_AWS_PASSWORD",
        "DB_AZURE_PASSWORD",
      ]);
      expect(secretEnv[0].value_source.secret_key_ref.version).toBe("latest");
      expect(container.startup_probe).toBeUndefined();
      expect(container.liveness_probe).toBeUndefined();

      const access = resourcesOf(synth, "google_secret_manager_secret_iam_member")[
        "run-api-secret-access-web-service-with-lb"
      ];
      expect(access.role).toBe("roles/secretmanager.secretAccessor");
      expect(access.member).toContain("-compute@developer.gserviceaccount.com");
      expect(service.depends_on).toContain(
        "google_secret_manager_secret_iam_member.run-api-secret-access-web-service-with-lb",
      );

      // Services not deployed by CI/CD are unchanged
      const standalone = resourcesOf(synth, "google_cloud_run_v2_service")["run-web-service-standalone"];
      expect(standalone.template.containers[0].env).toBeUndefined();
    });

    test("Container Apps: env, but no Key Vault secret before azureSecretReady", () => {
      const app = resourcesOf(synth, "azurerm_container_app")["aca-app-backend-api-service"];
      const container = app.template.container[0];
      expect(envOf(container.env)).toMatchObject({
        CLOUD_ID: "azure",
        DB_HOST: expect.stringMatching(/^\$\{azurerm_postgresql_flexible_server\..*\.fqdn\}$/),
        PEER_NODES: "aws,google",
      });
      expect(app.secret).toBeUndefined();
      expect(container.env.some((e: any) => e.secret_name)).toBe(false);
      expect(container.readiness_probe).toBeUndefined();
    });
  });

  test("azureSecretReady: the Container App reads the password from Key Vault", () => {
    const synth = synthWith({ azureSecretReady: true });
    const app = resourcesOf(synth, "azurerm_container_app")["aca-app-backend-api-service"];
    expect(app.secret).toHaveLength(1);
    expect(app.secret[0].name).toBe("db-api-password");
    expect(app.secret[0].key_vault_secret_id).toMatch(/vault_uri}secrets\/db-api-password$/);
    expect(app.identity.identity_ids).toContain(app.secret[0].identity);
    expect(app.identity.identity_ids).toHaveLength(2); // + AcrPull
    expect(
      app.template.container[0].env.filter((e: any) => e.secret_name).map((e: any) => e.name),
    ).toEqual(["DB_PASSWORD", "DB_AWS_PASSWORD", "DB_GOOGLE_PASSWORD"]);

    const roles = Object.values(resourcesOf(synth, "azurerm_role_assignment")).filter(
      (r) => r.role_definition_name === "Key Vault Secrets User",
    );
    expect(roles).toHaveLength(1);
  });

  test("readinessProbe: Cloud Run and Container Apps probe /readyz and /healthz", () => {
    const synth = synthWith({ readinessProbe: true });
    const run = resourcesOf(synth, "google_cloud_run_v2_service")["run-web-service-with-lb"]
      .template.containers[0];
    expect(run.startup_probe.http_get.path).toBe("/readyz");
    expect(run.liveness_probe.http_get.path).toBe("/healthz");

    const aca = resourcesOf(synth, "azurerm_container_app")["aca-app-backend-api-service"]
      .template.container[0];
    expect(aca.readiness_probe).toEqual([{ transport: "HTTP", port: 8080, path: "/readyz" }]);
    expect(aca.liveness_probe).toEqual([{ transport: "HTTP", port: 8080, path: "/healthz" }]);
  });

  test("two clouds: only the clouds with a database are nodes", () => {
    const synth = synthWith({}, {
      ...FEATURE_SETS.allOn,
      clouds: {
        aws: allFeaturesOn,
        google: allFeaturesOn,
        azure: { ...allFeaturesOn, features: { ...allFeaturesOn.features, dbs: false } },
      },
    });
    const container = ecsContainer(synth, "api-service");
    expect(envOf(container.environment).PEER_NODES).toBe("google");
    expect(container.secrets.map((s: any) => s.name)).toEqual(["DB_PASSWORD", "DB_GOOGLE_PASSWORD"]);

    const app = resourcesOf(synth, "azurerm_container_app")["aca-app-backend-api-service"];
    expect(envOf(app.template.container[0].env)).not.toHaveProperty("CLOUD_ID");
  });

  describe("journalPrune", () => {
    const enabled = () => ({
      journalPrune: { ...apiContainerConfig.journalPrune, enabled: true },
    });

    test("Azure needs azureSecretReady", () => {
      expect(() => synthWith(enabled())).toThrow("azureSecretReady");
    });

    describe("enabled", () => {
      let synth: any;
      beforeAll(() => {
        synth = synthWith({ ...enabled(), azureSecretReady: true });
      });

      test("AWS: EventBridge Scheduler runs the latest API task definition with the prune command", () => {
        const schedules = Object.values(resourcesOf(synth, "aws_scheduler_schedule"));
        expect(schedules).toHaveLength(1);
        const [schedule] = schedules;
        expect(schedule.schedule_expression).toBe("cron(0 3 * * ? *)");
        expect(schedule.schedule_expression_timezone).toBe("Asia/Tokyo");
        expect(schedule.target.ecs_parameters.task_definition_arn).toBe(
          "${aws_ecs_task_definition.task-def-api-service.arn_without_revision}",
        );
        expect(JSON.parse(schedule.target.input)).toEqual({
          containerOverrides: [
            {
              name: "api-container",
              command: ["node", "dist/prune.js"],
              environment: [{ name: "JOURNAL_RETENTION_DAYS", value: "30" }],
            },
          ],
        });
        const policy = Object.values(resourcesOf(synth, "aws_iam_role_policy")).find((p) =>
          p.policy.includes("ecs:RunTask"),
        );
        expect(policy.policy).toContain("iam:PassRole");
      });

      test("Google Cloud: a Cloud Run job with the API settings, Cloud Scheduler and CI/CD access", () => {
        const job = Object.values(resourcesOf(synth, "google_cloud_run_v2_job"))[0];
        const container = job.template.template.containers[0];
        expect(container.command).toEqual(["node", "dist/prune.js"]);
        expect(container.image).toContain("data.google_cloud_run_v2_service");
        expect(envOf(container.env)).toMatchObject({ CLOUD_ID: "google", JOURNAL_RETENTION_DAYS: "30" });
        expect(container.env.filter((e: any) => e.value_source).map((e: any) => e.name)).toEqual([
          "DB_PASSWORD",
          "DB_AWS_PASSWORD",
          "DB_AZURE_PASSWORD",
        ]);
        expect(job.template.template.vpc_access.network_interfaces).toHaveLength(1);

        const scheduler = Object.values(resourcesOf(synth, "google_cloud_scheduler_job"))[0];
        expect(scheduler.http_target.uri).toMatch(/^https:\/\/run\.googleapis\.com\/v2\/.*:run$/);
        expect(scheduler.time_zone).toBe("Asia/Tokyo");

        const trigger = Object.values(resourcesOf(synth, "google_cloudbuild_trigger"))[0];
        expect(trigger.substitutions._PRUNE_JOB).toBeDefined();
        const roles = Object.values(resourcesOf(synth, "google_cloud_run_v2_job_iam_member")).map(
          (m) => m.role,
        );
        expect(roles.sort()).toEqual(["roles/run.developer", "roles/run.invoker"]);
      });

      test("Azure: a scheduled Container Apps job with the Key Vault secret and CI/CD access", () => {
        const job = Object.values(resourcesOf(synth, "azurerm_container_app_job"))[0];
        expect(job.schedule_trigger_config.cron_expression).toBe("40 18 * * *");
        expect(job.secret).toHaveLength(1);
        const container = job.template.container[0];
        expect(container.command).toEqual(["node", "dist/prune.js"]);
        expect(container.image).toContain("data.azurerm_container_app");
        expect(container.env.filter((e: any) => e.secret_name)).toHaveLength(3);

        const pipeline = Object.values(resourcesOf(synth, "azuredevops_build_definition"))[0];
        expect(JSON.stringify(pipeline.variable)).toContain("PRUNE_JOB_NAME");
      });
    });
  });

  describe("topology", () => {
    const noVpn = { ...FEATURE_SETS.allOn, useVpn: false, hostZones: false };

    test("cluster: several clouds with a database need the VPN and private DNS", () => {
      expect(() => synthWith({}, noVpn)).toThrow(/useVpn, hostZones/);
      // ... and every one of them connected
      expect(() =>
        synthWith({}, { ...FEATURE_SETS.allOn, awsToGoogle: false, awsToAzure: false }),
      ).toThrow("not connected: aws");
    });

    test("cluster: one cloud with a database needs neither", () => {
      const synth = synthWith({}, {
        ...noVpn,
        clouds: {
          aws: allFeaturesOn,
          google: { ...allFeaturesOn, features: { ...allFeaturesOn.features, dbs: false } },
          azure: { ...allFeaturesOn, features: { ...allFeaturesOn.features, dbs: false } },
        },
      });
      const container = ecsContainer(synth, "api-service");
      expect(envOf(container.environment).PEER_NODES).toBe("");
      expect(container.secrets.map((s: any) => s.name)).toEqual(["DB_PASSWORD"]);
    });

    test("independent: every cloud alone, without the VPN or private DNS", () => {
      const synth = synthWith({ topology: "independent" }, noVpn);
      const aws = envOf(ecsContainer(synth, "api-service").environment);
      expect(aws.PEER_NODES).toBe("");
      expect(aws).not.toHaveProperty("DB_GOOGLE_HOST");
      const run = resourcesOf(synth, "google_cloud_run_v2_service")["run-web-service-with-lb"]
        .template.containers[0];
      expect(envOf(run.env).PEER_NODES).toBe("");
      expect(run.env.filter((e: any) => e.value_source).map((e: any) => e.name)).toEqual([
        "DB_PASSWORD",
      ]);
      const aca = resourcesOf(synth, "azurerm_container_app")["aca-app-backend-api-service"]
        .template.container[0];
      expect(envOf(aca.env)).toMatchObject({ CLOUD_ID: "azure", PEER_NODES: "" });
    });
  });
});
