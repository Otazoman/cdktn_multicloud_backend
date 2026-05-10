import { LOCATION, PROJECT_NAME } from "./common";

export const gcpLbConfigs = [
  /* =====================================================
     1. Regional HTTP Load Balancer
     - Simple HTTP access for Cloud Run
  ===================================================== */
  {
    name: "run-regional-http-lb",
    build: true,
    project: PROJECT_NAME,
    loadBalancerType: "REGIONAL",
    region: LOCATION,
    reserveStaticIp: true,
    protocol: "HTTP",
    port: 80,
    networkTier: "PREMIUM",
    loadBalancingScheme: "EXTERNAL_MANAGED",

    // DNS settings
    dnsConfig: {
      subdomain: "googletest.tohonokai.com",
      fqdn: "api.googletest.tohonokai.com",
    },

    // SSL is not used for HTTP
    managedSsl: undefined,

    backends: [
      {
        name: "run-http-backend",
        protocol: "HTTP",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        cloudRunServiceName: "web-service-with-lb",
      },
    ],
    defaultBackendName: "run-http-backend",
  },

  /* =====================================================
     2. Regional HTTPS Load Balancer
     - Secure access using SSL certificates
  ===================================================== */
  {
    name: "run-regional-https-lb",
    build: false,
    project: PROJECT_NAME,
    loadBalancerType: "REGIONAL",
    region: LOCATION,
    reserveStaticIp: true,
    protocol: "HTTPS",
    port: 443,
    networkTier: "PREMIUM",
    loadBalancingScheme: "EXTERNAL_MANAGED",

    // DNS settings
    dnsConfig: {
      subdomain: "googletest.tohonokai.com",
      fqdn: "api.googletest.tohonokai.com",
    },

    // SSL Configuration for Regional LB
    // Includes domain names and paths to certificate files
    managedSsl: {
      domains: ["api.googletest.tohonokai.com"],
      certificatePath: "./sslcerts/openssl/server.crt",
      privateKeyPath: "./sslcerts/openssl/server.key",
    },

    // Reference names for already registered certificate resources
    sslCertificateNames: ["regional-run-cert-resource"],

    backends: [
      {
        name: "run-https-backend",
        protocol: "HTTP", // Backend (LB to Cloud Run) usually uses HTTP
        loadBalancingScheme: "EXTERNAL_MANAGED",
        cloudRunServiceName: "web-service-with-lb",
      },
    ],
    defaultBackendName: "run-https-backend",
  },
];
