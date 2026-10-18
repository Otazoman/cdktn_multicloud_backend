import { LOCATION, PUBLIC_DOMAIN, RESOURCE_GROUP } from "./common";

import type { AzureAppGwConfig } from "../../constructs/loadbalancer/azureappgw";

/**
 * Application Gateway settings: the construct's AzureAppGwConfig with the
 * subnet *name* (resolved to an ID by clouds/azure/container.ts), plus DNS
 * settings.
 */
export interface AzureAppGwSettings extends Omit<AzureAppGwConfig, "subnetId"> {
  subnetName: string;
  dnsConfig?: { subdomain: string; fqdn?: string };
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
    build: false,
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
        data: "./sslcerts/pfx/azureappgw_certificate.pfx",
        password: process.env.AZURE_APPGW_SSL_CERT_PASSWORD!,
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
    build: true,
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
