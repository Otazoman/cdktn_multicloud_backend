import { DefaultRouteTable } from "@cdktf/provider-aws/lib/default-route-table";
import { Ec2InstanceConnectEndpoint } from "@cdktf/provider-aws/lib/ec2-instance-connect-endpoint";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { SecurityGroup } from "@cdktf/provider-aws/lib/security-group";
import { SecurityGroupRule } from "@cdktf/provider-aws/lib/security-group-rule";
import { Subnet } from "@cdktf/provider-aws/lib/subnet";
import { Vpc as AwsVpc } from "@cdktf/provider-aws/lib/vpc";
import { Construct } from "constructs";

interface SubnetConfig {
  cidrBlock: string;
  az: string;
  name: string;
}

interface SecurityGroupRuleConfig {
  fromPort: number;
  toPort: number;
  protocol: string;
  cidrBlocks: string[];
  ipv6CidrBlocks?: string[];
  description?: string;
}

interface SecurityGroupConfig {
  resourcetype: string;
  name: string;
  ingress: SecurityGroupRuleConfig[];
  egress: SecurityGroupRuleConfig[];
}

interface ec2InstanceConnectEndpointsConfig {
  endpointName: string;
  securityGroupNames: string[];
}

interface AwsResourcesParams {
  vpcCidrBlock: string;
  vpcName: string;
  subnets: SubnetConfig[];
  securityGroups: SecurityGroupConfig[];
  defaultRouteTableName: string;
  ec2ICEndpoint: ec2InstanceConnectEndpointsConfig;
}

export function createAwsVpcResources(
  scope: Construct,
  provider: AwsProvider,
  params: AwsResourcesParams
) {
  // vpc
  const vpc = new AwsVpc(scope, "awsVpc", {
    provider: provider,
    cidrBlock: params.vpcCidrBlock,
    enableDnsHostnames: true,
    enableDnsSupport: true,
    tags: {
      Name: params.vpcName,
    },
  });

  // subnets
  const subnets = params.subnets.map((subnetConfig, index) => {
    return new Subnet(scope, `awsSubnet${index}`, {
      provider: provider,
      vpcId: vpc.id,
      cidrBlock: subnetConfig.cidrBlock,
      availabilityZone: subnetConfig.az,
      tags: {
        Name: subnetConfig.name,
      },
    });
  });

  // security groups
  const securityGroups = params.securityGroups.map((sgConfig, index) => {
    const sg = new SecurityGroup(scope, `awsSecurityGroup${index}`, {
      provider: provider,
      vpcId: vpc.id,
      name: sgConfig.name,
      ingress:
        sgConfig.ingress.length > 0
          ? sgConfig.ingress.map((rule) => ({
              fromPort: rule.fromPort,
              toPort: rule.toPort,
              protocol: rule.protocol,
              cidrBlocks: rule.cidrBlocks,
              ipv6CidrBlocks: rule.ipv6CidrBlocks,
              description: rule.description,
            }))
          : [],
      egress:
        sgConfig.egress.length > 0
          ? sgConfig.egress.map((rule) => ({
              fromPort: rule.fromPort,
              toPort: rule.toPort,
              protocol: rule.protocol,
              cidrBlocks: rule.cidrBlocks,
              ipv6CidrBlocks: rule.ipv6CidrBlocks,
              description: rule.description,
            }))
          : [],
      tags: {
        Name: sgConfig.name,
      },
    });
    return sg;
  });

  // routetable
  new DefaultRouteTable(scope, "defaultRouteTable", {
    provider: provider,
    defaultRouteTableId: vpc.defaultRouteTableId,
    tags: {
      Name: params.defaultRouteTableName,
    },
  });

  // EC2 Instance Connect Endpoint
  const firstSubnet = subnets[0];
  const securityGroupMapping = Object.fromEntries(
    securityGroups.map((sg, index) => [
      `${params.securityGroups[index].name}`,
      sg.id,
    ])
  );

  const ec2InstanceConnectEndpoint = new Ec2InstanceConnectEndpoint(
    scope,
    "ec2InstanceConnectEndpoint",
    {
      provider: provider,
      subnetId: firstSubnet.id,
      securityGroupIds: params.ec2ICEndpoint.securityGroupNames.map(
        (name) => securityGroupMapping[name]
      ),
      tags: {
        Name: params.ec2ICEndpoint.endpointName,
      },
    }
  );

  // Add instance connect SG to EC2 security group
  const ec2SecurityGroup = securityGroups.find(
    (_, index) => params.securityGroups[index].resourcetype === "ec2"
  );

  if (ec2SecurityGroup) {
    const ec2ConnectSgId =
      securityGroupMapping[params.ec2ICEndpoint.securityGroupNames[0]];

    new SecurityGroupRule(scope, "ec2InstanceConnectIngressRule", {
      provider: provider,
      type: "ingress",
      fromPort: 22,
      toPort: 22,
      protocol: "tcp",
      sourceSecurityGroupId: ec2ConnectSgId,
      securityGroupId: ec2SecurityGroup.id,
      description: "Allow SSH from EC2 Instance Connect Endpoint",
    });
  }

  return {
    vpc,
    subnets,
    securityGroups,
    securityGroupMapping,
    ec2InstanceConnectEndpoint,
  };
}
