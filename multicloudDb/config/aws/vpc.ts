/* VPC configuration parameters */
export const awsVpcResourcesparams = {
  vpcCidrBlock: "10.0.0.0/16",
  vpcName: "my-aws-vpc",
  isEnabled: true,
  vpcTags: {
    Project: "MultiCloud",
  },
  subnets: [
    {
      cidrBlock: "10.0.10.0/24",
      az: "ap-northeast-1a",
      name: "my-aws-vpc-public-subnet1",
      type: "public",
      tags: {
        Tier: "Web",
      },
    },
    {
      cidrBlock: "10.0.20.0/24",
      az: "ap-northeast-1a",
      name: "my-aws-vpc-private-subnet1",
      type: "private",
      tags: {
        Tier: "App",
      },
    },
    {
      cidrBlock: "10.0.30.0/24",
      az: "ap-northeast-1c",
      name: "my-aws-vpc-private-subnet2",
      type: "private",
      tags: {
        Tier: "DB",
      },
    },
  ],
  securityGroups: [
    {
      resourcetype: "ec2",
      name: "my-aws-vpc-sg1",
      tags: {
        Purpose: "General",
      },
      ingress: [
        {
          fromPort: 0,
          toPort: 0,
          protocol: "-1",
          cidrBlocks: ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"],
          description: "Allow all inbound traffic",
        },
      ],
      egress: [
        {
          fromPort: 0,
          toPort: 0,
          protocol: "-1",
          cidrBlocks: ["0.0.0.0/0"],
          ipv6CidrBlocks: ["::/0"],
          description: "Allow all outbound traffic",
        },
      ],
    },
    {
      resourcetype: "other",
      name: "EC2InstanceConnect",
      tags: {
        Purpose: "EC2Connect",
      },
      ingress: [],
      egress: [
        {
          fromPort: 22,
          toPort: 22,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
          ipv6CidrBlocks: ["::/0"],
          description: "EC2 Instance Connect",
        },
      ],
    },
  ],
  ec2ICEndpoint: {
    endpointName: "my-ec2-instance-connect-endpoint",
    securityGroupNames: ["EC2InstanceConnect"],
  },
  natGateway: {
    enable: true,
    name: "my-aws-vpc-nat-gateway",
    tags: {
      Purpose: "NAT",
    },
  },
  defaultRouteTableName: "my-aws-vpc-routetable",
  routeTables: {
    public: {
      name: "my-aws-vpc-public-routetable",
      associatedSubnetNames: ["my-aws-vpc-public-subnet1"],
      tags: {
        Purpose: "Public",
      },
    },
    private: {
      name: "my-aws-vpc-private-routetable",
      associatedSubnetNames: [
        "my-aws-vpc-private-subnet1",
        "my-aws-vpc-private-subnet2",
      ],
      tags: {
        Purpose: "Private",
      },
    },
  },
};