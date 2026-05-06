import { LOCATION, RESOURCE_GROUP } from "./common";

export const azureAppGwConfigs = [
  {
    name: "plain-https-appgw",
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
        port: 80,
        protocol: "Http",
        redirectToListener: "https-only-listener",
      },
      {
        name: "https-only-listener",
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
        password: "Password123!",
      },
    ],
    tags: {
      Environment: "Test",
      Protocol: "HTTPS",
    },
  },
  {
    name: "main-waf-appgw",
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
        port: 80,
        protocol: "Http",
        defaultBackendName: "api-backend",
      },
      {
        name: "http-alt",
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
      { name: "api-backend", port: 80, protocol: "Http", requestTimeout: 30 },
      {
        name: "static-content",
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
