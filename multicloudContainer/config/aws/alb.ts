export const albConfigs = [
  {
    name: "main-alb",
    build: true,
    internal: false,
    securityGroupNames: ["alb-sg"],
    subnetNames: ["my-aws-vpc-public-subnet1a", "my-aws-vpc-public-subnet1c"],
    // DNS configuration for subdomain and FQDN
    dnsConfig: {
      subdomain: "awstest.tohonokai.com",
      fqdn: "api.awstest.tohonokai.com", // Optional: specific FQDN for this ALB
    },
    // Certificate configuration for HTTPS
    // Note: Public DNS zone must be created manually in advance
    certificateConfig: {
      enabled: true,
      domains: ["*.awstest.tohonokai.com", "awstest.tohonokai.com"],
      validationZone: "awstest.tohonokai.com", // Zone for DNS validation
    },
    // HTTPS listener (certificate will be attached automatically)
    listenerConfig: {
      port: 443,
      protocol: "HTTPS",
      defaultAction: {
        type: "forward",
        targetGroupName: "ecs-api-tg",
      },
    },
    // Additional HTTP listener for redirect
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
        name: "ecs-api-tg",
        port: 80,
        protocol: "HTTP",
        targetType: "ip",
        healthCheckPath: "/health",
      },
    ],
    listenerRules: [
      {
        priority: 10,
        conditions: { pathPatterns: ["/api/*"] },
        action: { type: "forward", targetGroupName: "ecs-api-tg" },
      },
    ],
    tags: {
      Name: "main-alb",
      Environment: "production",
      Project: "MyCloudApp",
      ManagedBy: "CDKTF",
    },
  },
];
