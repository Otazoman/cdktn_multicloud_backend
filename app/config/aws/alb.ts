import type { AlbConfig } from "../../constructs/loadbalancer/awsalb";

/**
 * ALB settings: the construct's AlbConfig with security group / subnet
 * *names* (resolved to IDs by clouds/aws/container.ts), plus DNS and
 * certificate settings.
 */
export interface AwsAlbSettings
  extends Omit<AlbConfig, "securityGroupIds" | "subnetIds"> {
  build: boolean;
  securityGroupNames: string[];
  subnetNames: string[];
  dnsConfig?: { subdomain: string; fqdn?: string };
  certificateConfig?: {
    enabled: boolean;
    mode: "AWS_MANAGED" | "IMPORT";
    domains: string[];
    /** AWS_MANAGED: public zone used for DNS validation */
    validationZone?: string;
    /** IMPORT: certificate files */
    certificatePath?: string;
    privateKeyPath?: string;
    certificateChainPath?: string;
  };
}

export const albConfigs: AwsAlbSettings[] = [
  // 1. Pattern: AWS Managed Certificate (Auto-request via DNS validation)
  {
    name: "managed-https-alb",
    build: true,
    internal: false,
    securityGroupNames: ["alb-sg"],
    subnetNames: ["my-aws-vpc-public-subnet1a", "my-aws-vpc-public-subnet1c"],
    dnsConfig: {
      subdomain: "awstest.tohonokai.com",
      fqdn: "api.awstest.tohonokai.com",
    },
    certificateConfig: {
      enabled: true,
      mode: "AWS_MANAGED",
      domains: ["api.awstest.tohonokai.com"],
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

  // 2. Pattern: Plain HTTP (Public IP access for Blue/Green)
  {
    name: "plain-http-alb",
    build: false,
    internal: false,
    securityGroupNames: ["alb-sg"],
    subnetNames: ["my-aws-vpc-public-subnet1a", "my-aws-vpc-public-subnet1c"],
    dnsConfig: {
      subdomain: "",
      fqdn: "",
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
