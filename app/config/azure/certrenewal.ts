/**
 * Renewal job of the Let's Encrypt certificates of the Application Gateway
 * (sslCertificates entries with mode "LETS_ENCRYPT" in applicationgateway.ts).
 *
 * A Container Apps job in the API's environment (VNet: reaches the Key Vault
 * through its private endpoint) runs scripts/azure/cert-renew.sh on a
 * schedule. When the certificate is missing in the Key Vault or expires
 * within renewBeforeDays, it requests a new one from Let's Encrypt with lego
 * (DNS-01 on the Azure public zone) and imports it into the Key Vault. The
 * Application Gateway references the certificate without a version and picks
 * up a new version within 4 hours.
 *
 * During the deploy, scripts/azure-cert-job-wait.sh starts the job once and
 * waits for it, so that the certificate exists when the Application Gateway
 * is created. It needs the public zone delegated from the parent zone
 * (state/<env>/parent-dns.json) or registered by hand while it waits.
 *
 * Let's Encrypt issues at most 5 certificates for the same set of names per
 * 7 days: every new environment (deploy after a destroy) uses one.
 */
export const azureCertRenewalConfig = {
  /** Container Apps environment of the job (containerapps.ts environmentName) */
  environmentName: "main-env",
  /** Schedule (cron, UTC): daily at 18:00 UTC (03:00 JST) */
  cronExpression: "0 18 * * *",
  /** Renew when the certificate expires within this many days */
  renewBeforeDays: 30,
  /**
   * Resources of the job (Consumption: memory = 2 x cpu). Installing the
   * missing tools with tdnf is killed with 0.5Gi
   */
  cpu: 1.0,
  memory: "2Gi",
  /** Image of the job: Azure CLI on Azure Linux (bash, jq), pinned */
  image: "mcr.microsoft.com/azure-cli:2.91.0-azurelinux3.0",
  /** ACME client, downloaded by the job and checked against the SHA-256 */
  lego: {
    version: "v4.35.2",
    linuxAmd64Sha256: "ee5be4bf457de8e3efa86a51651c75c87f0ee0e4e9f3ae14f6034d68365770f3",
  },
  /** ACME directories (acmeServer of the certificate entry) */
  acmeDirectories: {
    production: "https://acme-v02.api.letsencrypt.org/directory",
    staging: "https://acme-staging-v02.api.letsencrypt.org/directory",
  },
  /** Seconds the deploy waits for the job (issuance and DNS propagation) */
  deployWaitTimeoutSeconds: 1800,
  /** Seconds one job run may take */
  replicaTimeoutSeconds: 1500,
};
