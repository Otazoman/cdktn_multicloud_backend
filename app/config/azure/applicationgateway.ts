import { LOCATION, PUBLIC_DOMAIN, RESOURCE_GROUP } from "./common";

import type { AzureAppGwConfig } from "../../constructs/loadbalancer/azureappgw";

/**
 * TLS certificate of a listener.
 *
 * LETS_ENCRYPT: issued by Let's Encrypt and renewed automatically by the
 *   renewal job (certrenewal.ts) into the Key Vault, which the gateway
 *   references. Needs the public zone (features.dns) and the Container Apps
 *   environment; the Key Vault (secrets.ts) is created for it even without
 *   features.dbs.
 * IMPORT (or omitted): the PFX file `data` with its `password`.
 */
export interface AzureAppGwCertificateSettings {
  name: string;
  mode?: "LETS_ENCRYPT" | "IMPORT";
  // LETS_ENCRYPT
  /** Names of the certificate (in the public zone of dnsConfig.subdomain) */
  domains?: string[];
  /** Name of the certificate in the Key Vault */
  keyVaultCertificateName?: string;
  /** production (trusted by browsers) or staging (relaxed rate limits) */
  acmeServer?: "production" | "staging";
  /** Renewal job (certrenewal.ts), at most 32 characters. Default: <PROJECT_NAME>-azure-cert-renew-<name> (shortened) */
  renewalJobName?: string;
  // IMPORT
  data?: string;
  password?: string;
}

/**
 * Application Gateway settings: the construct's AzureAppGwConfig with the
 * subnet *name* (resolved to an ID by clouds/azure/container.ts), plus DNS
 * and certificate settings.
 */
export interface AzureAppGwSettings
  extends Omit<
    AzureAppGwConfig,
    "subnetId" | "sslCertificates" | "identityIds"
  > {
  subnetName: string;
  dnsConfig?: { subdomain: string; fqdn?: string };
  sslCertificates?: AzureAppGwCertificateSettings[];
  /** User-assigned identity of the gateway (LETS_ENCRYPT certificates). Default: <PROJECT_NAME>-azure-identity-<name> */
  identityName?: string;
}

export const azureAppGwConfigs: AzureAppGwSettings[] = [
  {
    name: "plain-https-appgw",
    // Names of the gateway resources and sub-resources (omitted: default name)
    names: {
      publicIp: "plain-https-appgw-pip",
      gatewayIpConfiguration: "plain-https-appgw-gw-ip-config",
      frontendIpConfiguration: "plain-https-appgw-feip",
      frontendPorts: {
        80: "plain-https-appgw-80-port",
        443: "plain-https-appgw-443-port",
      },
    },
    location: LOCATION,
    resourceGroupName: RESOURCE_GROUP,
    build: true,
    // false: fixed `capacity` instances. true: autoscale between
    // minCapacity (0-100) and maxCapacity (2-125); capacity is then ignored.
    useAutoscale: false,
    sku: {
      name: "Standard_v2",
      tier: "Standard_v2",
      capacity: 1,
      // Used only when useAutoscale is true
      minCapacity: 1,
      maxCapacity: 2,
    },
    // DNS configuration
    dnsConfig: {
      subdomain: PUBLIC_DOMAIN,
      fqdn: `api.${PUBLIC_DOMAIN}`,
    },
    listeners: [
      {
        name: "http-only-listener",
        names: {
          listener: "plain-https-appgw-http-only-listener-listener",
          rule: "plain-https-appgw-http-only-listener-rule",
          redirect:
            "plain-https-appgw-http-only-listener-to-https-only-listener-rd",
        },
        port: 80,
        protocol: "Http",
        redirectToListener: "https-only-listener",
      },
      {
        name: "https-only-listener",
        names: {
          listener: "plain-https-appgw-https-only-listener-listener",
          rule: "plain-https-appgw-https-only-listener-rule",
        },
        port: 443,
        protocol: "Https",
        defaultBackendName: "api-backend-pool",
        sslCertificateName: "my-ssl-cert",
      },
    ],
    enableHttp2: true,
    subnetName: "web-appgw-subnet",
    backends: [
      {
        name: "api-backend-pool",
        names: {
          pool: "api-backend-pool-pool",
          setting: "api-backend-pool-setting",
        },
        port: 80,
        protocol: "Http",
        requestTimeout: 30,
        pickHostNameFromBackendAddress: true,
        targetFqdns: ["backend-api-service"],
      },
    ],
    sslCertificates: [
      {
        name: "my-ssl-cert",
        mode: "LETS_ENCRYPT",
        domains: [`api.${PUBLIC_DOMAIN}`],
        keyVaultCertificateName: "plain-https-appgw-api-cert",
        acmeServer: "production",
        renewalJobName: "plain-https-appgw-cert-renew",
        // IMPORT: PFX file and its password
        data: "./sslcerts/pfx/azureappgw_certificate.pfx",
        password: process.env.AZURE_APPGW_SSL_CERT_PASSWORD,
      },
    ],
    tags: {
      Environment: "Test",
      Protocol: "HTTPS",
    },
  },
  {
    name: "plain-http-appgw",
    // Names of the gateway resources and sub-resources (omitted: default name)
    names: {
      publicIp: "plain-http-appgw-pip",
      gatewayIpConfiguration: "plain-http-appgw-gw-ip-config",
      frontendIpConfiguration: "plain-http-appgw-feip",
      frontendPorts: {
        80: "plain-http-appgw-80-port",
      },
    },
    location: LOCATION,
    resourceGroupName: RESOURCE_GROUP,
    build: false,
    useAutoscale: false,
    sku: {
      name: "Standard_v2",
      tier: "Standard_v2",
      capacity: 1,
    },
    dnsConfig: {
      subdomain: PUBLIC_DOMAIN,
      fqdn: `api.${PUBLIC_DOMAIN}`,
    },
    listeners: [
      {
        name: "http-only-listener",
        names: {
          listener: "plain-http-appgw-http-only-listener-listener",
          rule: "plain-http-appgw-http-only-listener-rule",
        },
        port: 80,
        protocol: "Http",
        defaultBackendName: "api-backend-pool",
      },
    ],
    enableHttp2: true,
    subnetName: "web-appgw-subnet",
    backends: [
      {
        name: "api-backend-pool",
        names: {
          pool: "api-backend-pool-pool",
          setting: "api-backend-pool-setting",
        },
        port: 80,
        protocol: "Http",
        requestTimeout: 30,
        pickHostNameFromBackendAddress: true,
        targetFqdns: ["backend-api-service"],
      },
    ],
    sslCertificates: [],
    tags: {
      Environment: "Test",
      Protocol: "HTTP-Only",
    },
  },
];
