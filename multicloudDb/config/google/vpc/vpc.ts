/* VPC configuration parameters */
import { firewallEgressRules, firewallIngressRules } from './firewallRules';
import { subnets } from './subnets';

export const googleVpcResourcesparams = {
  isEnabled: false,
  vpcName: "my-gcp-vpc",
  vpcCidrblock: "10.1.0.0/16",
  vpcLabels: {
    Environment: "Development",
    Project: "MultiCloud",
  },

  subnets: subnets,
  
  firewallIngressRules: firewallIngressRules,
  firewallEgressRules: firewallEgressRules,

  natConfig: {
    enable: true,
    name: "google-nat-gateway",
    region: "asia-northeast1",
    routerName: "natgateway-router",
  },
};