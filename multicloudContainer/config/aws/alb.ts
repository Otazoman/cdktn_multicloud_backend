export const albConfigs = [
  // 1. Pattern: AWS Managed Certificate (Auto-request via DNS validation)
  {
    name: "managed-cert-alb",
    build: false,
    internal: false,
    securityGroupNames: ["alb-sg"],
    subnetNames: ["my-aws-vpc-public-subnet1a", "my-aws-vpc-public-subnet1c"],
    dnsConfig: {
      subdomain: "awstest.tohonokai.com",
      fqdn: "managed.awstest.tohonokai.com",
    },
    certificateConfig: {
      enabled: true,
      mode: "AWS_MANAGED" as "AWS_MANAGED" | "IMPORT",
      domains: ["managed.awstest.tohonokai.com"],
      validationZone: "awstest.tohonokai.com",
      certificatePath: undefined,
      privateKeyPath: undefined,
      certificateChainPath: undefined,
    },
    listenerConfig: {
      port: 443,
      protocol: "HTTPS",
      defaultAction: {
        type: "forward",
        targetGroupName: "managed-api-tg",
      },
    },
    additionalListeners: [
      {
        port: 80,
        protocol: "HTTP",
        defaultAction: {
          type: "redirect",
          redirect: { port: "443", protocol: "HTTPS", statusCode: "HTTP_301" },
        },
      },
    ],
    targetGroups: [
      {
        name: "managed-api-tg",
        port: 80,
        protocol: "HTTP",
        targetType: "ip",
        healthCheckPath: "/health",
      },
    ],
    listenerRules: [],
    tags: {
      Name: "managed-cert-alb",
      ManagedBy: "CDKTF",
    },
  },

  // 2. Pattern: Imported Certificate (Upload existing local files to ACM)
  {
    name: "imported-cert-alb",
    build: false,
    internal: false,
    securityGroupNames: ["alb-sg"],
    subnetNames: ["my-aws-vpc-public-subnet1a", "my-aws-vpc-public-subnet1c"],
    dnsConfig: {
      subdomain: "awstest.tohonokai.com",
      fqdn: "imported.awstest.tohonokai.com",
    },
    certificateConfig: {
      enabled: true,
      mode: "IMPORT" as "AWS_MANAGED" | "IMPORT",
      domains: ["imported.awstest.tohonokai.com"],
      validationZone: "awstest.tohonokai.com",
      // Paths to your local SSL certificate files
      certificatePath: "./sslcerts/openssl/server.crt",
      privateKeyPath: "./sslcerts/openssl/server.key",
      certificateChainPath: undefined, // Optional
    },
    listenerConfig: {
      port: 443,
      protocol: "HTTPS",
      defaultAction: {
        type: "forward",
        targetGroupName: "imported-api-tg",
      },
    },
    additionalListeners: [
      {
        port: 80,
        protocol: "HTTP",
        defaultAction: {
          type: "redirect",
          redirect: { port: "443", protocol: "HTTPS", statusCode: "HTTP_301" },
        },
      },
    ],
    targetGroups: [
      {
        name: "imported-api-tg",
        port: 80,
        protocol: "HTTP",
        targetType: "ip",
        healthCheckPath: "/health",
      },
    ],
    listenerRules: [],
    tags: {
      Name: "imported-cert-alb",
      ManagedBy: "CDKTF",
    },
  },

  // 3. Pattern: No Certificate (HTTP only)
  {
    name: "http-only-alb",
    build: false,
    internal: false,
    securityGroupNames: ["alb-sg"],
    subnetNames: ["my-aws-vpc-public-subnet1a", "my-aws-vpc-public-subnet1c"],
    dnsConfig: {
      subdomain: "awstest.tohonokai.com",
      fqdn: "http.awstest.tohonokai.com",
    },
    certificateConfig: {
      enabled: false, // Disable certificate processing
      mode: "AWS_MANAGED" as "AWS_MANAGED" | "IMPORT",
      domains: [],
      validationZone: "",
      certificatePath: undefined,
      privateKeyPath: undefined,
      certificateChainPath: undefined,
    },
    listenerConfig: {
      port: 80,
      protocol: "HTTP",
      defaultAction: {
        type: "forward",
        targetGroupName: "http-api-tg",
      },
    },
    additionalListeners: [], // No HTTPS redirect needed
    targetGroups: [
      {
        name: "http-api-tg",
        port: 80,
        protocol: "HTTP",
        targetType: "ip",
        healthCheckPath: "/health",
      },
    ],
    listenerRules: [],
    tags: {
      Name: "http-only-alb",
      ManagedBy: "CDKTF",
    },
  },
  {
    name: "plain-http-alb",
    build: true,
    internal: false, // Public access via IP
    securityGroupNames: ["alb-sg"],
    subnetNames: ["my-aws-vpc-public-subnet1a", "my-aws-vpc-public-subnet1c"],
    // dnsConfig is not used for Route53 record creation in this pattern
    dnsConfig: {
      subdomain: "",
      fqdn: "",
    },
    certificateConfig: {
      enabled: false, // Fully disable ACM certificate logic
      mode: "AWS_MANAGED" as "AWS_MANAGED" | "IMPORT",
      domains: [],
      validationZone: "",
      certificatePath: undefined,
      privateKeyPath: undefined,
      certificateChainPath: undefined,
    },
    listenerConfig: {
      port: 80,
      protocol: "HTTP",
      defaultAction: {
        type: "forward",
        targetGroupName: "plain-http-tg",
      },
    },
    additionalListeners: [], // No Port 443 redirect
    targetGroups: [
      {
        name: "plain-http-tg",
        port: 80,
        protocol: "HTTP",
        targetType: "ip",
        healthCheckPath: "/",
      },
    ],
    listenerRules: [],
    tags: {
      Name: "plain-http-alb",
      ManagedBy: "CDKTF",
      AccessType: "IP-Only",
    },
  },
];
