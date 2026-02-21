export const gcpLbConfigs = [
  {
    name: "production-http-xlb",
    project: "multicloud-sitevpn-project",
    build: true,
    loadBalancerType: "GLOBAL",
    reserveStaticIp: true,
    protocol: "HTTP",
    port: 80,
    networkTier: "PREMIUM",
    loadBalancingScheme: "EXTERNAL_MANAGED",
    // DNS configuration
    dnsConfig: {
      subdomain: "googletest.tohonokai.com",
      fqdn: "www.googletest.tohonokai.com", // Optional: specific FQDN for this LB
    },

    backends: [
      {
        name: "api-backend-service",
        protocol: "HTTP",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        healthCheck: {
          port: 8080,
          requestPath: "/v1/health",
        },
      },
      {
        name: "web-backend-service",
        protocol: "HTTP",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        healthCheck: {
          port: 80,
          requestPath: "/",
        },
      },
    ],

    defaultBackendName: "web-backend-service",

    hostRules: [
      {
        hosts: ["api.example.com"],
        pathMatcher: "api-matcher",
      },
      {
        hosts: ["*"],
        pathMatcher: "default-matcher",
      },
    ],

    pathMatchers: [
      {
        name: "api-matcher",
        defaultBackendName: "api-backend-service",
        pathRules: [
          {
            paths: ["/*"],
            backendName: "api-backend-service",
          },
        ],
      },
      {
        name: "default-matcher",
        defaultBackendName: "web-backend-service",
        pathRules: [
          {
            paths: ["/api/*"],
            backendName: "api-backend-service",
          },
        ],
      },
    ],
  },
  {
    name: "production-https-xlb",
    project: "multicloud-sitevpn-project",
    build: true,
    loadBalancerType: "GLOBAL",
    reserveStaticIp: true,
    protocol: "HTTPS",
    port: 443,
    // DNS configuration
    dnsConfig: {
      subdomain: "googletest.tohonokai.com",
      fqdn: "api.googletest.tohonokai.com", // Optional: specific FQDN for this LB
    },
    // Managed SSL certificate configuration
    // Note: Public DNS zone must be created manually in advance
    managedSsl: {
      domains: ["api.googletest.tohonokai.com"],
    },
    networkTier: "PREMIUM",
    loadBalancingScheme: "EXTERNAL_MANAGED",

    backends: [
      {
        name: "api-https-backend-service",
        protocol: "HTTP",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        healthCheck: {
          port: 8080,
          requestPath: "/v1/health",
        },
      },
    ],

    defaultBackendName: "api-https-backend-service",
  },

  {
    name: "regional-http-web-lb",
    project: "multicloud-sitevpn-project",
    build: true,
    loadBalancerType: "REGIONAL",
    region: "asia-northeast1",
    subnetworkName: "vpc-asia-northeast1",
    reserveStaticIp: true,
    protocol: "HTTP",
    port: 80,
    networkTier: "PREMIUM",
    loadBalancingScheme: "EXTERNAL_MANAGED",
    // DNS configuration
    dnsConfig: {
      subdomain: "googletest.tohonokai.com",
      fqdn: "regional.googletest.tohonokai.com", // Optional: specific FQDN for this LB
    },

    backends: [
      {
        name: "regional-web-backend",
        protocol: "HTTP",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        healthCheck: {
          port: 80,
          requestPath: "/",
        },
      },
    ],

    defaultBackendName: "regional-web-backend",
  },
  {
    name: "regional-https-web-lb",
    project: "multicloud-sitevpn-project",
    build: true,
    loadBalancerType: "REGIONAL",
    region: "asia-northeast1",
    subnetworkName: "vpc-asia-northeast1",
    reserveStaticIp: true,
    protocol: "HTTPS",
    port: 443,
    // DNS configuration
    dnsConfig: {
      subdomain: "googletest.tohonokai.com",
      fqdn: "regional-secure.googletest.tohonokai.com", // Optional: specific FQDN for this LB
    },
    // Managed SSL certificate configuration
    // Note: Public DNS zone must be created manually in advance
    managedSsl: {
      domains: [
        "regional-secure.googletest.tohonokai.com",
        "googletest.tohonokai.com",
      ],
    },
    networkTier: "PREMIUM",
    loadBalancingScheme: "EXTERNAL_MANAGED",

    backends: [
      {
        name: "regional-https-web-backend",
        protocol: "HTTP",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        healthCheck: {
          port: 80,
          requestPath: "/",
        },
      },
    ],

    defaultBackendName: "regional-https-web-backend",
  },
];
