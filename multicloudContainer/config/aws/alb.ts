export const albConfigs = [
  {
    name: "main-alb",
    build: true,
    internal: false,
    securityGroupNames: ["alb-sg"],
    subnetNames: ["my-aws-vpc-public-subnet1a", "my-aws-vpc-public-subnet1c"],
    listenerConfig: {
      port: 80,
      protocol: "HTTP",
      defaultAction: {
        type: "redirect",
        redirect: { port: "443", protocol: "HTTPS", statusCode: "HTTP_301" },
      },
    },
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
