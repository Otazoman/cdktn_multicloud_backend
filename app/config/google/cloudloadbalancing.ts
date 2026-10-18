import { LOCATION, PROJECT_NAME, PUBLIC_DOMAIN } from "./common";

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
      subdomain: PUBLIC_DOMAIN,
      fqdn: `api.${PUBLIC_DOMAIN}`,
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
      subdomain: PUBLIC_DOMAIN,
      fqdn: `api.${PUBLIC_DOMAIN}`,
    },

    // SSL Configuration for Regional LB
    // Includes domain names and paths to certificate files
    managedSsl: {
      // Default: <project>-google-ssl-certificate-<LB name>
      certificateName: "run-regional-https-lb-cert",
      domains: [`api.${PUBLIC_DOMAIN}`],
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
];

// Public DNS zone name per sub-domain used in dnsConfig above
// (omitted: <project>-google-public-zone-<domain>)
export const gcpPublicZoneNames: Record<string, string> = {
  [PUBLIC_DOMAIN]: `zone-${PUBLIC_DOMAIN.replace(/\./g, "-")}`,
};
