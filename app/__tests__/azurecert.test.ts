/**
 * Let's Encrypt certificates of the Azure Application Gateway: a renewal job
 * issues the certificate into the Key Vault (started and waited for during
 * the deploy), and the gateway references it with its own identity.
 */
import { azureAppGwConfigs } from "../config/azure/applicationgateway";
import { FEATURE_SETS, synthCase } from "../scripts/dev/synthMatrix";

const mockParentDns = {
  current: undefined as
    | { roleArn: string; hostedZoneId: string; accountId: string }
    | undefined,
};
jest.mock("../config/parentdns", () => ({
  ...jest.requireActual("../config/parentdns"),
  parentDnsSettings: () => mockParentDns.current,
}));

const resourcesOf = (synth: any, type: string): any[] =>
  Object.values(synth.resource?.[type] ?? {});
const entriesOf = (synth: any, type: string): [string, any][] =>
  Object.entries(synth.resource?.[type] ?? {});

const snapshots = azureAppGwConfigs.map((c) => structuredClone(c));
const httpsGw = azureAppGwConfigs.find((c) => c.name === "plain-https-appgw")!;
const httpGw = azureAppGwConfigs.find((c) => c.name === "plain-http-appgw")!;

const synthHttps = (features: Record<string, unknown> = FEATURE_SETS.allOn) => {
  // Both gateways use the same host name: build the HTTPS one only
  httpGw.build = false;
  httpsGw.build = true;
  return synthCase({ name: "azurecert", overrides: features });
};

afterEach(() => {
  mockParentDns.current = undefined;
  azureAppGwConfigs.forEach((c, i) => {
    Object.keys(c).forEach((k) => delete (c as any)[k]);
    Object.assign(c, structuredClone(snapshots[i]));
  });
});

test("LETS_ENCRYPT: renewal job with its roles, waited for before the gateway", () => {
  const synth = synthHttps();

  const [[jobKey, job]] = entriesOf(synth, "azurerm_container_app_job").filter(
    ([, j]) => j.name === "plain-https-appgw-cert-renew",
  );
  expect(job.identity).toEqual({ type: "SystemAssigned" });
  expect(job.schedule_trigger_config.cron_expression).toBe("0 18 * * *");
  const container = job.template.container[0];
  // The script is embedded with Terraform template sequences escaped
  expect(container.command[2]).toContain("$${IDENTITY_HEADER}");
  expect(container.command[2]).not.toMatch(/[^$]\$\{IDENTITY_HEADER\}/);
  const env = Object.fromEntries(container.env.map((e: any) => [e.name, e.value]));
  expect(env).toMatchObject({
    CERT_NAME: "plain-https-appgw-api-cert",
    DOMAINS: "api.azuretest.tohonokai.com",
    ACME_SERVER: "https://acme-v02.api.letsencrypt.org/directory",
    AZURE_AUTH_METHOD: "msi",
    AZURE_ZONE_NAME: expect.stringContaining("azurerm_dns_zone."),
  });

  // Roles of the job's system-assigned identity
  const jobRoles = resourcesOf(synth, "azurerm_role_assignment").filter((r) =>
    String(r.principal_id).includes(`azurerm_container_app_job.${jobKey}.identity`),
  );
  expect(jobRoles.map((r) => r.role_definition_name).sort()).toEqual([
    "DNS Zone Contributor",
    "Key Vault Certificates Officer",
  ]);

  // Started and waited for during the deploy
  const [[waitKey, wait]] = entriesOf(synth, "null_resource").filter(([k]) =>
    k.startsWith("cert-renew-wait-"),
  );
  const exec = wait.provisioner[0]["local-exec"];
  expect(exec.command).toMatch(/^bash .*scripts\/azure-cert-job-wait\.sh$/);
  expect(exec.environment.JOB_NAME).toContain(`azurerm_container_app_job.${jobKey}.name`);
  expect(wait.depends_on).toEqual(
    expect.arrayContaining([expect.stringMatching(/^azurerm_role_assignment\./)]),
  );
  expect(wait.depends_on).toEqual(
    expect.arrayContaining([expect.stringMatching(/^azurerm_private_endpoint\./)]),
  );

  // The gateway reads the certificate from the Key Vault with its identity
  const [gw] = resourcesOf(synth, "azurerm_application_gateway").filter(
    (g) => g.ssl_certificate?.length,
  );
  expect(gw.identity.type).toBe("UserAssigned");
  expect(gw.ssl_certificate).toEqual([
    {
      name: "my-ssl-cert",
      key_vault_secret_id: expect.stringMatching(/secrets\/plain-https-appgw-api-cert$/),
    },
  ]);
  expect(gw.depends_on).toEqual(expect.arrayContaining([`null_resource.${waitKey}`]));
  const gwRole = resourcesOf(synth, "azurerm_role_assignment").find(
    (r) => r.role_definition_name === "Key Vault Secrets User" &&
      String(r.principal_id).includes("plain-https-appgw"),
  );
  expect(gwRole).toBeDefined();
});

test("LETS_ENCRYPT with the parent zone: the issuance waits for the NS record", () => {
  mockParentDns.current = {
    roleArn: "arn:aws:iam::111122223333:role/cdktn-ns-delegation",
    hostedZoneId: "ZPARENT",
    accountId: "111122223333",
  };
  const synth = synthHttps();

  const [nsKey] = entriesOf(synth, "aws_route53_record")
    .filter(([, r]) => r.type === "NS" && r.name === "azuretest.tohonokai.com")
    .map(([k]) => k);
  const [wait] = entriesOf(synth, "null_resource")
    .filter(([k]) => k.startsWith("cert-renew-wait-"))
    .map(([, w]) => w);
  expect(wait.depends_on).toEqual(expect.arrayContaining([`aws_route53_record.${nsKey}`]));
});

test("LETS_ENCRYPT without dbs: the Key Vault is created for the certificate", () => {
  const allOn = FEATURE_SETS.allOn as any;
  const synth = synthHttps({
    ...allOn,
    clouds: {
      ...allOn.clouds,
      azure: { ...allOn.clouds.azure, features: { ...allOn.clouds.azure.features, dbs: false } },
    },
  });

  expect(resourcesOf(synth, "azurerm_postgresql_flexible_server")).toHaveLength(0);
  expect(resourcesOf(synth, "azurerm_key_vault")).toHaveLength(1);
  expect(
    resourcesOf(synth, "azurerm_container_app_job").filter((j) => j.name === "plain-https-appgw-cert-renew"),
  ).toHaveLength(1);
});

test("without Let's Encrypt certificates and dbs: no Key Vault", () => {
  // Only the plain HTTP gateway (whatever the config builds)
  httpGw.build = true;
  httpsGw.build = false;
  const allOn = FEATURE_SETS.allOn as any;
  const synth = synthCase({
    name: "azurecert-no-kv",
    overrides: {
      ...allOn,
      clouds: {
        ...allOn.clouds,
        azure: { ...allOn.clouds.azure, features: { ...allOn.clouds.azure.features, dbs: false } },
      },
    },
  });

  expect(resourcesOf(synth, "azurerm_key_vault")).toHaveLength(0);
});

test("IMPORT: the PFX file is uploaded as before, no job and no identity", () => {
  httpsGw.sslCertificates![0].mode = "IMPORT";
  httpsGw.sslCertificates![0].password = "dummy";
  const synth = synthHttps();

  expect(
    resourcesOf(synth, "azurerm_container_app_job").filter((j) => j.name === "plain-https-appgw-cert-renew"),
  ).toHaveLength(0);
  const [gw] = resourcesOf(synth, "azurerm_application_gateway").filter(
    (g) => g.ssl_certificate?.length,
  );
  expect(gw.ssl_certificate[0]).toMatchObject({ name: "my-ssl-cert", password: "dummy" });
  expect(gw.ssl_certificate[0].data).toBeTruthy();
  expect(gw.identity).toBeUndefined();
});
