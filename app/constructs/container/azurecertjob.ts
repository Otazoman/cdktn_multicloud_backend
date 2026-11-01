import { ContainerAppJob } from "@cdktn/provider-azurerm/lib/container-app-job";
import { DataAzurermClientConfig } from "@cdktn/provider-azurerm/lib/data-azurerm-client-config";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { RoleAssignment } from "@cdktn/provider-azurerm/lib/role-assignment";
import { NullProvider } from "@cdktn/provider-null/lib/provider";
import { Resource as NullResource } from "@cdktn/provider-null/lib/resource";
import { Construct } from "constructs";
import * as fs from "fs";

import { idPart } from "../../utils/naming";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { createAzureRoleAssignments } from "../iam/azureidentity";

export interface AzureCertRenewalJobConfig {
  /** Certificate name in the Key Vault (also the construct ID key) */
  certificateName: string;
  jobName: string;
  location: string;
  resourceGroupName: string;
  containerAppEnvironmentId: string;
  image: string;
  cpu: number;
  memory: string;
  cronExpression: string;
  replicaTimeoutSeconds: number;
  /** Script run by the job (scripts/azure/cert-renew.sh) */
  scriptPath: string;
  /** Environment of the script */
  environment: {
    keyVaultUri: string;
    domains: string[];
    acmeServer: string;
    renewBeforeDays: number;
    legoVersion: string;
    legoSha256: string;
    /** Public zone (in the provider's subscription) */
    zoneResourceGroupName: string;
    zoneName: string;
  };
  /** Role scopes: the public zone (TXT records) and the Key Vault (import) */
  dnsZoneId: string;
  keyVaultId: string;
  /** Run during the deploy and waited for (scripts/azure-cert-job-wait.sh) */
  deployWait: { scriptPath: string; timeoutSeconds: number };
}

/**
 * Scheduled Container Apps job that issues / renews a Let's Encrypt
 * certificate into the Key Vault, with its system-assigned identity's roles,
 * and a null resource that starts the job once during the deploy and waits
 * for it (local-exec). Resources that need the certificate depend on
 * `issued`.
 */
export function createAzureCertRenewalJob(
  scope: Construct,
  provider: AzurermProvider,
  nullProvider: NullProvider,
  config: AzureCertRenewalJobConfig,
): { job: ContainerAppJob; roleAssignments: RoleAssignment[]; issued: NullResource } {
  const key = idPart(config.certificateName);
  const env = config.environment;
  const client = new DataAzurermClientConfig(scope, `cert-renew-client-config-${key}`, {
    provider,
  });

  const job = new ContainerAppJob(scope, `cert-renew-${key}`, {
    provider,
    name: config.jobName,
    location: config.location,
    resourceGroupName: config.resourceGroupName,
    containerAppEnvironmentId: config.containerAppEnvironmentId,
    replicaTimeoutInSeconds: config.replicaTimeoutSeconds,
    replicaRetryLimit: 1,
    scheduleTriggerConfig: {
      cronExpression: config.cronExpression,
      parallelism: 1,
      replicaCompletionCount: 1,
    },
    identity: { type: "SystemAssigned" },
    template: {
      container: [
        {
          name: "cert-renew",
          image: config.image,
          command: ["/bin/bash", "-c", terraformLiteral(fs.readFileSync(config.scriptPath, "utf8"))],
          cpu: config.cpu,
          memory: config.memory,
          env: [
            { name: "KEY_VAULT_URI", value: env.keyVaultUri },
            { name: "CERT_NAME", value: config.certificateName },
            { name: "DOMAINS", value: env.domains.join(" ") },
            { name: "ACME_SERVER", value: env.acmeServer },
            { name: "RENEW_BEFORE_DAYS", value: String(env.renewBeforeDays) },
            { name: "LEGO_VERSION", value: env.legoVersion },
            { name: "LEGO_SHA256", value: env.legoSha256 },
            // lego azuredns provider: the job's managed identity
            { name: "AZURE_AUTH_METHOD", value: "msi" },
            { name: "AZURE_SUBSCRIPTION_ID", value: client.subscriptionId },
            { name: "AZURE_RESOURCE_GROUP", value: env.zoneResourceGroupName },
            { name: "AZURE_ZONE_NAME", value: env.zoneName },
            { name: "AZURE_PROPAGATION_TIMEOUT", value: "600" },
          ],
        },
      ],
    },
  });

  const roleAssignments = createAzureRoleAssignments(
    scope,
    provider,
    `cert-renew-${config.certificateName}`,
    job.identity.principalId,
    [
      { key: "dns-zone-contributor", role: "DNS Zone Contributor", scope: config.dnsZoneId },
      {
        key: "kv-certificates-officer",
        role: "Key Vault Certificates Officer",
        scope: config.keyVaultId,
      },
    ],
  );

  const issued = new NullResource(scope, `cert-renew-wait-${key}`, {
    provider: nullProvider,
    // Runs again only when the job is replaced (a new environment)
    triggers: { jobId: job.id },
  });
  issued.addOverride("provisioner", [
    {
      "local-exec": {
        command: `bash ${config.deployWait.scriptPath}`,
        environment: {
          SUBSCRIPTION_ID: client.subscriptionId,
          RESOURCE_GROUP: config.resourceGroupName,
          JOB_NAME: job.name,
          TIMEOUT_SECONDS: String(config.deployWait.timeoutSeconds),
        },
      },
    },
  ]);
  addTerraformDependency(issued, roleAssignments);

  return { job, roleAssignments, issued };
}

/** Escapes Terraform template sequences (${ and %{) of a literal string */
function terraformLiteral(value: string): string {
  return value.replace(/\$\{/g, () => "$${").replace(/%\{/g, () => "%%{");
}
