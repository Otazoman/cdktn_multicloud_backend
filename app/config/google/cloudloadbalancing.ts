import { LOCATION, PROJECT_NAME } from "./common";

export const gcpLbConfigs = [
  /* =====================================================
     1. Regional HTTP Load Balancer
     - Simple HTTP access for Cloud Run
  ===================================================== */
  {
    name: "run-regional-http-lb",
    // Names of the LB's resources (omitted: default name)
    names: {
      staticIp: "run-regional-http-lb-ip",
      proxy: "run-regional-http-lb-http-proxy",
      forwardingRule: "run-regional-http-lb-http-fw",
    },
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
        // serverlessNeg: Cloud Run backends / healthCheck: other backends
        names: { serverlessNeg: "run-http-backend-sneg" },
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
    // Names of the LB's resources (omitted: default name)
    names: {
      staticIp: "run-regional-https-lb-ip",
      proxy: "run-regional-https-lb-https-proxy",
      forwardingRule: "run-regional-https-lb-https-fw",
    },
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
      // Default: <project>-google-ssl-certificate-<LB name>
      certificateName: "run-regional-https-lb-cert",
      domains: ["api.googletest.tohonokai.com"],
      certificatePath: "./sslcerts/openssl/server.crt",
      privateKeyPath: "./sslcerts/openssl/server.key",
    },

    // Reference names for already registered certificate resources
    sslCertificateNames: ["regional-run-cert-resource"],

    backends: [
      {
        name: "run-https-backend",
        // serverlessNeg: Cloud Run backends / healthCheck: other backends
        names: { serverlessNeg: "run-https-backend-sneg" },
        protocol: "HTTP", // Backend (LB to Cloud Run) usually uses HTTP
        loadBalancingScheme: "EXTERNAL_MANAGED",
        cloudRunServiceName: "web-service-with-lb",
      },
    ],
    defaultBackendName: "run-https-backend",
  },
  /* =====================================================
     3. Global HTTPS Load Balancer
     - Secure access using Global Google-managed SSL certificates
     - Backend routes to Cloud Run via Serverless NEG
  ===================================================== */
  {
    name: "run-global-https-lb",
    // Names of the LB's resources (omitted: default name)
    names: {
      staticIp: "run-global-https-lb-ip",
      proxy: "run-global-https-lb-https-proxy",
      forwardingRule: "run-global-https-lb-https-fw",
    },
    build: false,
    project: PROJECT_NAME,
    loadBalancerType: "GLOBAL", // ★ Changed from REGIONAL to GLOBAL
    region: LOCATION, // Global LB does not belong to a specific region
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

    // SSL Configuration for Global Managed LB
    // Google automatically provisions and renews SSL certificates for these domains
    managedSsl: {
      // Default: <project>-google-ssl-certificate-<LB name>
      certificateName: "run-global-https-lb-cert",
      domains: ["api.googletest.tohonokai.com"],
      certificatePath: undefined, // Not required for Google-managed certificates
      privateKeyPath: undefined, // Not required for Google-managed certificates
    },

    sslCertificateNames: [],

    backends: [
      {
        name: "run-global-backend",
        // serverlessNeg: Cloud Run backends / healthCheck: other backends
        names: { serverlessNeg: "run-global-backend-sneg" },
        protocol: "HTTP",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        cloudRunServiceName: "web-service-with-lb",
      },
    ],
    defaultBackendName: "run-global-backend",
  },
];

// Public DNS zone name per sub-domain used in dnsConfig above
// (omitted: <project>-google-public-zone-<domain>)
export const gcpPublicZoneNames: Record<string, string> = {
  "googletest.tohonokai.com": "zone-googletest-tohonokai-com",
};
