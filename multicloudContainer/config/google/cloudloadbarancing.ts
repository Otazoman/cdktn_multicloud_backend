import { LOCATION, PROJECT_NAME } from "./common";

export const gcpLbConfigs = [
  {
    name: "production-http-xlb",
    project: PROJECT_NAME,
    build: false,
    loadBalancerType: "GLOBAL" as "GLOBAL" | "REGIONAL",
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
    project: PROJECT_NAME,
    build: false,
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
    project: PROJECT_NAME,
    build: false,
    loadBalancerType: "REGIONAL" as "GLOBAL" | "REGIONAL",
    region: LOCATION,
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
    project: PROJECT_NAME,
    build: false,
    loadBalancerType: "REGIONAL" as "GLOBAL" | "REGIONAL",
    region: LOCATION,
    subnetworkName: "vpc-asia-northeast1",
    reserveStaticIp: true,
    protocol: "HTTPS",
    port: 443,
    dnsConfig: {
      subdomain: "googletest.tohonokai.com",
      fqdn: "regional-secure.googletest.tohonokai.com",
    },
    // MODIFIED: Use self-managed certificate fields for REGIONAL LB
    managedSsl: {
      domains: ["regional-secure.googletest.tohonokai.com"],
      // Paths to your certificate and private key files
      // Make sure these files exist on your environment
      certificatePath: "./sslcerts/openssl/server.crt",
      privateKeyPath: "./sslcerts/openssl/server.key",
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
  {
    name: "plain-http-google-lb",
    project: PROJECT_NAME,
    build: true,
    loadBalancerType: "GLOBAL" as "GLOBAL" | "REGIONAL",
    reserveStaticIp: true, // Recommended to keep IP constant
    protocol: "HTTP",
    port: 80,
    networkTier: "PREMIUM",
    loadBalancingScheme: "EXTERNAL_MANAGED",

    // DNS configuration is empty/undefined for IP-based access
    dnsConfig: {
      subdomain: "",
      fqdn: "",
    },

    // IMPORTANT: managedSsl is completely omitted or has empty domains
    // to ensure no certificate resources are created.
    managedSsl: undefined,

    backends: [
      {
        name: "plain-http-backend",
        protocol: "HTTP",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        healthCheck: {
          port: 80,
          requestPath: "/",
        },
      },
    ],

    defaultBackendName: "plain-http-backend",

    // Simple Host Rule for all-match
    hostRules: [
      {
        hosts: ["*"],
        pathMatcher: "plain-matcher",
      },
    ],

    pathMatchers: [
      {
        name: "plain-matcher",
        defaultBackendName: "plain-http-backend",
        pathRules: [],
      },
    ],
    tags: {
      Environment: "Test",
      Access: "IP-Only",
    },
  },
  {
    name: "regional-plain-http-lb",
    project: PROJECT_NAME,
    build: true,
    loadBalancerType: "REGIONAL" as "GLOBAL" | "REGIONAL",
    region: LOCATION,
    subnetworkName: "vpc-asia-northeast1",
    reserveStaticIp: true,
    protocol: "HTTP",
    port: 80,
    networkTier: "PREMIUM",
    loadBalancingScheme: "EXTERNAL_MANAGED",
    dnsConfig: {
      subdomain: "",
      fqdn: "",
    },
    managedSsl: undefined,

    backends: [
      {
        name: "regional-plain-backend",
        protocol: "HTTP",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        healthCheck: {
          port: 80,
          requestPath: "/",
        },
      },
    ],

    defaultBackendName: "regional-plain-backend",
    hostRules: [
      {
        hosts: ["*"],
        pathMatcher: "regional-matcher",
      },
    ],
    pathMatchers: [
      {
        name: "regional-matcher",
        defaultBackendName: "regional-plain-backend",
        pathRules: [],
      },
    ],
    tags: {
      Environment: "Test",
      Type: "Regional-IP-Only",
    },
  },
];
