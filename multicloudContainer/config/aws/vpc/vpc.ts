/* VPC configuration parameters */
import { securityGroups } from "./securitygroups";
import { subnets } from "./subnets";

export const awsVpcResourcesparams = {
  vpcCidrBlock: "10.0.0.0/16",
  vpcName: "my-aws-vpc",
  isEnabled: true,
  vpcTags: {
    Project: "MultiCloud",
  },
  subnets: subnets,
  securityGroups: securityGroups,

  // ICE Endpoint
  ec2ICEndpoint: {
    endpointName: "my-ec2-instance-connect-endpoint",
    securityGroupNames: ["EC2InstanceConnect"],
  },

  // Nat Gateway
  natGateway: {
    enable: true,
    name: "my-aws-vpc-nat-gateway",
    tags: {
      Purpose: "NAT",
    },
  },

  // Route Table
  defaultRouteTableName: "my-aws-vpc-routetable",
  routeTables: {
    public: {
      name: "my-aws-vpc-public-routetable",
      associatedSubnetNames: [
        "my-aws-vpc-public-subnet1a",
        "my-aws-vpc-public-subnet1c",
        "my-aws-vpc-public-subnet1d",
      ],
      tags: {
        Purpose: "Public",
      },
    },
    private: {
      name: "my-aws-vpc-private-routetable",
      associatedSubnetNames: [
        "my-aws-vpc-private-subnet1a",
        "my-aws-vpc-private-subnet1c",
        "my-aws-vpc-private-subnet1d",
        "my-aws-vpc-db-private-subnet1a",
        "my-aws-vpc-db-private-subnet1c",
        "my-aws-vpc-db-private-subnet1d",
      ],
      tags: {
        Purpose: "Private",
      },
    },
  },
};
