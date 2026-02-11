export const gcpLbConfigs = [
  {
    name: "production-xlb",
    project: "multicloud-sitevpn-project",
    build: true,
    reserveStaticIp: true,
    backends: [
      {
        name: "api-backend-service",
        protocol: "HTTP",
        loadBalancingScheme: "EXTERNAL_MANAGED", // Modern Global HTTP(S) LB
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
    pathRules: [
      {
        paths: ["/api/*"],
        backendName: "api-backend-service",
      },
    ],
  },
];
