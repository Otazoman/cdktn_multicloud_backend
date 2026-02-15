/* VPC configuration parameters */
import { firewallEgressRules, firewallIngressRules } from "./firewallRules";
import { subnets } from "./subnets";

export const googleVpcResourcesparams = {
  vpcName: "multicloud-gcp-vpc",
  isEnabled: true,
  vpcCidrblock: "10.1.0.0/16",
  vpcLabels: {
    Environment: "Development",
    Project: "MultiCloud",
  },

  subnets: subnets,
  proxySubnets: [
    {
      name: "proxy-subnet",
      cidr: "10.1.30.0/24",
      region: "asia-northeast1",
    },
  ],

  firewallIngressRules: firewallIngressRules,
  firewallEgressRules: firewallEgressRules,

  natConfig: {
    enable: true,
    name: "google-nat-gateway",
    region: "asia-northeast1",
    routerName: "natgateway-router",
  },
};
