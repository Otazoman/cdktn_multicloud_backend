import { LOCATION, RESOURCE_GROUP } from "./common";

export const azureAppGwConfigs = [
  {
    name: "standard-appgw",
    location: LOCATION,
    resourceGroupName: RESOURCE_GROUP,
    build: false,
    useAutoscale: false,
    sku: {
      name: "Standard_v2",
      tier: "Standard_v2",
      capacity: 1,
    },
    // DNS configuration
    dnsConfig: {
      subdomain: "azuretest.tohonokai.com",
      fqdn: "api.azuretest.tohonokai.com", // Optional: specific FQDN for this App Gateway
    },
    listeners: [
      {
        name: "http-basic",
        port: 80,
        protocol: "Http",
        redirectToListener: "https-basic",
      },
      {
        name: "https-basic",
        port: 443,
        protocol: "Https",
        defaultBackendName: "default-be",
        sslCertificateName: "my-ssl-cert",
      },
    ],
    enableHttp2: true,
    subnetName: "web-appgw-subnet",
    backends: [
      { name: "default-be", port: 80, protocol: "Http", requestTimeout: 30 },
    ],
    tags: { Environment: "Dev", Project: "MyCloudApp" },
    sslCertificates: [
      {
        name: "my-ssl-cert",
        data: "./sslcerts/pfx/azureappgw_certificate.pfx",
        password: "Password123!",
      },
    ],
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
    // --- Specific Backend Mapping for each Listener ---
    listeners: [
      {
        name: "http-main",
        port: 80,
        protocol: "Http",
        defaultBackendName: "api-backend", // Port 80 defaults to API
      },
      {
        name: "http-alt",
        port: 8080,
        protocol: "Http",
        defaultBackendName: "static-content", // Port 8080 defaults to Static Content
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
    // These paths override the listener's defaultBackendName if matched
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
    build: true,
    useAutoscale: false,
    sku: {
      name: "Standard_v2",
      tier: "Standard_v2",
      capacity: 1,
    },
    // No specific dnsConfig provided (Access via Public IP or Default Azure DNS)
    listeners: [
      {
        name: "http-only-listener",
        port: 80,
        protocol: "Http",
        defaultBackendName: "http-backend-pool",
      },
    ],
    enableHttp2: false,
    subnetName: "web-appgw-subnet",
    backends: [
      {
        name: "http-backend-pool",
        port: 80,
        protocol: "Http",
        requestTimeout: 30,
      },
    ],
    // Empty array as no SSL certificates are needed for Port 80
    sslCertificates: [],
    tags: {
      Environment: "Test",
      Protocol: "HTTP-Only",
    },
  },
];
