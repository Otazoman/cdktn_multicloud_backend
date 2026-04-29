export const albConfigs = [
  // 1. Pattern: AWS Managed Certificate (Auto-request via DNS validation)
  {
    name: "managed-https-alb",
    build: false,
    internal: false,
    securityGroupNames: ["alb-sg"],
    subnetNames: ["my-aws-vpc-public-subnet1a", "my-aws-vpc-public-subnet1c"],
    dnsConfig: {
      subdomain: "awstest.tohonokai.com",
      fqdn: "app.awstest.tohonokai.com",
    },
    certificateConfig: {
      enabled: true,
      mode: "AWS_MANAGED",
      domains: ["app.awstest.tohonokai.com"],
      validationZone: "awstest.tohonokai.com",
    },
    listenerConfig: {
      name: "production-listener",
      port: 443,
      protocol: "HTTPS",
      defaultAction: {
        type: "forward",
        targetGroupName: "managed-api-tg-blue",
      },
    },
    additionalListeners: [
      {
        name: "redirect-listener",
        port: 80,
        protocol: "HTTP",
        defaultAction: {
          type: "redirect",
          redirect: { port: "443", protocol: "HTTPS", statusCode: "HTTP_301" },
        },
      },
      {
        name: "test-listener",
        port: 8080,
        protocol: "HTTP",
        defaultAction: {
          type: "forward",
          targetGroupName: "managed-api-tg-green",
        },
      },
    ],
    targetGroups: [
      {
        name: "managed-api-tg-blue",
        port: 80,
        protocol: "HTTP",
        targetType: "ip",
        healthCheckPath: "/",
      },
      {
        name: "managed-api-tg-green",
        port: 80,
        protocol: "HTTP",
        targetType: "ip",
        healthCheckPath: "/",
      },
    ],
    listenerRules: [],
    tags: {
      Name: "managed-https-alb",
      ManagedBy: "CDKTN",
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
      certificatePath: "./sslcerts/openssl/server.crt",
      privateKeyPath: "./sslcerts/openssl/server.key",
      certificateChainPath: undefined,
    },
    listenerConfig: {
      name: "production-listener",
      port: 443,
      protocol: "HTTPS",
      defaultAction: {
        type: "forward",
        targetGroupName: "imported-api-tg",
      },
    },
    additionalListeners: [
      {
        name: "redirect-listener",
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
      enabled: false,
      mode: "AWS_MANAGED" as "AWS_MANAGED" | "IMPORT",
      domains: [],
      validationZone: "",
      certificatePath: undefined,
      privateKeyPath: undefined,
      certificateChainPath: undefined,
    },
    listenerConfig: {
      name: "production-listener",
      port: 80,
      protocol: "HTTP",
      defaultAction: {
        type: "forward",
        targetGroupName: "http-api-tg",
      },
    },
    additionalListeners: [],
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

  // 4. Pattern: Plain HTTP (Public IP access for Blue/Green)
  {
    name: "plain-http-alb",
    build: true,
    internal: false,
    securityGroupNames: ["alb-sg"],
    subnetNames: ["my-aws-vpc-public-subnet1a", "my-aws-vpc-public-subnet1c"],
    dnsConfig: {
      subdomain: "",
      fqdn: "",
    },
    certificateConfig: {
      enabled: true,
      mode: "AWS_MANAGED" as "AWS_MANAGED" | "IMPORT",
      domains: [],
      validationZone: "",
      certificatePath: undefined,
      privateKeyPath: undefined,
      certificateChainPath: undefined,
    },
    listenerConfig: {
      name: "production-listener",
      port: 80,
      protocol: "HTTP",
      defaultAction: {
        type: "forward",
        targetGroupName: "managed-api-tg-blue",
      },
    },
    additionalListeners: [
      {
        name: "test-listener",
        port: 8080,
        protocol: "HTTP",
        defaultAction: {
          type: "forward",
          targetGroupName: "managed-api-tg-green",
        },
      },
    ],
    targetGroups: [
      {
        name: "managed-api-tg-blue",
        port: 80,
        protocol: "HTTP",
        targetType: "ip",
        healthCheckPath: "/",
      },
      {
        name: "managed-api-tg-green",
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
