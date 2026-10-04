import { LOCATION, RESOURCE_GROUP } from "./common";

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
    build: true,
    useAutoscale: false,
    sku: {
      name: "Standard_v2",
      tier: "Standard_v2",
      capacity: 1,
    },
    // DNS configuration
    dnsConfig: {
      subdomain: "azuretest.tohonokai.com",
      fqdn: "api.azuretest.tohonokai.com",
    },
    listeners: [
      {
        name: "http-only-listener",
        names: {
          listener: "plain-https-appgw-http-only-listener-listener",
          rule: "plain-https-appgw-http-only-listener-rule",
          redirect: "plain-https-appgw-http-only-listener-to-https-only-listener-rd",
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
        names: { pool: "api-backend-pool-pool", setting: "api-backend-pool-setting" },
        port: 80,
        protocol: "Http",
        requestTimeout: 30,
        pickHostNameFromBackendAddress: true,
        // hostName: "api.azuretest.tohonokai.com",
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
    name: "main-waf-appgw",
    // Names of the gateway resources and sub-resources (omitted: default name)
    names: {
      publicIp: "main-waf-appgw-pip",
      wafPolicy: "main-waf-appgw-waf-policy",
      gatewayIpConfiguration: "main-waf-appgw-gw-ip-config",
      frontendIpConfiguration: "main-waf-appgw-feip",
      frontendPorts: {
        80: "main-waf-appgw-80-port",
        8080: "main-waf-appgw-8080-port",
      },
    },
    location: LOCATION,
    resourceGroupName: RESOURCE_GROUP,
    build: false,
    useAutoscale: true,
    sku: {
      name: "WAF_v2",
      tier: "WAF_v2",
      minCapacity: 1,
      maxCapacity: 3,
    },
    listeners: [
      {
        name: "http-main",
        names: {
          listener: "main-waf-appgw-http-main-listener",
          rule: "main-waf-appgw-http-main-rule",
          urlPathMap: "main-waf-appgw-http-main-map",
        },
        port: 80,
        protocol: "Http",
        defaultBackendName: "api-backend",
      },
      {
        name: "http-alt",
        names: {
          listener: "main-waf-appgw-http-alt-listener",
          rule: "main-waf-appgw-http-alt-rule",
          urlPathMap: "main-waf-appgw-http-alt-map",
        },
        port: 8080,
        protocol: "Http",
        defaultBackendName: "static-content",
      },
    ],
    enableHttp2: true,
    enableFips: false,
    subnetName: "web-appgw-subnet",
    wafConfig: {
      enabled: true,
      firewallMode: "Prevention",
      ruleSetType: "OWASP",
      ruleSetVersion: "3.2",
    },
    wafCustomRules: [
      {
        name: "BlockBadIPs",
        priority: 1,
        ruleType: "MatchRule",
        action: "Block",
        matchConditions: [
          {
            matchVariables: [{ variableName: "RemoteAddr" }],
            operator: "IPMatch",
            matchValues: ["192.168.1.100", "203.0.113.0/24"],
          },
        ],
      },
    ],
    backends: [
      {
        name: "api-backend",
        names: { pool: "api-backend-pool", setting: "api-backend-setting" },
        port: 80,
        protocol: "Http",
        requestTimeout: 30,
      },
      {
        name: "static-content",
        names: { pool: "static-content-pool", setting: "static-content-setting" },
        port: 80,
        protocol: "Http",
        requestTimeout: 30,
      },
    ],
    pathRules: [
      { name: "api-rule", paths: ["/api/*"], backendName: "api-backend" },
      {
        name: "static-rule",
        paths: ["/static/*"],
        backendName: "static-content",
      },
    ],
    tags: {
      Environment: "Production",
      SecurityLevel: "High",
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
      subdomain: "azuretest.tohonokai.com",
      fqdn: "api.azuretest.tohonokai.com",
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
        names: { pool: "api-backend-pool-pool", setting: "api-backend-pool-setting" },
        port: 80,
        protocol: "Http",
        requestTimeout: 30,
        pickHostNameFromBackendAddress: true,
        // hostName: "api.azuretest.tohonokai.com",
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
