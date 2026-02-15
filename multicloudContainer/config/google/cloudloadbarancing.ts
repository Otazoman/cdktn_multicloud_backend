export const gcpLbConfigs = [
  {
    name: "production-xlb",
    project: "multicloud-sitevpn-project",
    build: true,
    loadBalancerType: "GLOBAL",
    reserveStaticIp: true,
    protocol: "HTTP",
    port: 80,
    networkTier: "PREMIUM",
    loadBalancingScheme: "EXTERNAL_MANAGED",

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
    name: "regional-web-lb",
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
];
