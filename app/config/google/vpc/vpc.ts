/* VPC configuration parameters */
import { LOCATION } from "../common";
import { firewallEgressRules, firewallIngressRules } from "./firewallRules";
import { subnets } from "./subnets";

export const googleVpcResourcesparams = {
  vpcName: "multicloud-gcp-vpc",
  vpcCidrblock: "10.1.0.0/16",
  vpcLabels: {
    Environment: "Development",
    Project: "MultiCloud",
  },

  subnets: subnets,
  proxySubnets: [
    {
      name: "proxy-subnet",
      resourceName: "multicloud-gcp-vpc-proxy-subnet",
      cidr: "10.1.110.0/24",
      region: LOCATION,
    },
  ],

  firewallIngressRules: firewallIngressRules,
  firewallEgressRules: firewallEgressRules,

  natConfig: {
    enable: true,
    name: "google-nat-gateway",
    ipName: "google-nat-gateway-ip",
    region: LOCATION,
    routerName: "natgateway-router",
  },
};
