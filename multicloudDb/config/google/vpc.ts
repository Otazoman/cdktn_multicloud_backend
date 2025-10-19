/* VPC configuration parameters */

export const googleVpcResourcesparams = {
  vpcName: "my-gcp-vpc",
  isEnabled: true,
  vpcCidrblock: "10.1.0.0/16",
  vpcLabels: {
    Environment: "Development",
    Project: "MultiCloud",
  },
  subnets: [
    {
      name: "subnet1",
      cidr: "10.1.10.0/24",
      region: "asia-northeast1",
      labels: {
        Tier: "Web",
      },
    },
    {
      name: "subnet2",
      cidr: "10.1.20.0/24",
      region: "asia-northeast1",
      labels: {
        Tier: "App",
      },
    },
  ],
  firewallIngressRules: [
    {
      name: "google-ssh-allow-rule",
      permission: {
        protocol: "tcp",
        ports: ["22"],
      },
      sourceRanges: ["35.235.240.0/20"],
      priority: 1000,
    },
    {
      name: "internal-aws-rule",
      permission: {
        protocol: "all",
      },
      sourceRanges: ["10.0.0.0/16"],
      priority: 1000,
    },
    {
      name: "internal-google-rule",
      permission: {
        protocol: "all",
      },
      sourceRanges: ["10.1.0.0/16"],
      priority: 1000,
    },
    {
      name: "internal-azure-rule",
      permission: {
        protocol: "all",
      },
      sourceRanges: ["10.2.0.0/16"],
      priority: 1000,
    },
  ],
  firewallEgressRules: [
    {
      name: "vpn-rule",
      permission: {
        protocol: "all",
      },
      sourceRanges: ["0.0.0.0/0"],
      destinationRanges: ["0.0.0.0/0"],
      priority: 1000,
    },
  ],
  natConfig: {
    enable: true,
    name: "google-nat-gateway",
    region: "asia-northeast1",
    routerName: "natgateway-router",
  },
};