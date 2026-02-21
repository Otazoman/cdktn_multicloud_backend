import { DefaultRouteTable } from "@cdktn/provider-aws/lib/default-route-table"; // ★ DefaultRouteTable をインポート ★
import { Ec2InstanceConnectEndpoint } from "@cdktn/provider-aws/lib/ec2-instance-connect-endpoint";
import { Eip } from "@cdktn/provider-aws/lib/eip";
import { InternetGateway } from "@cdktn/provider-aws/lib/internet-gateway";
import { NatGateway } from "@cdktn/provider-aws/lib/nat-gateway";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Route } from "@cdktn/provider-aws/lib/route";
import { RouteTable } from "@cdktn/provider-aws/lib/route-table";
import { RouteTableAssociation } from "@cdktn/provider-aws/lib/route-table-association";
import { SecurityGroup } from "@cdktn/provider-aws/lib/security-group";
import { SecurityGroupRule } from "@cdktn/provider-aws/lib/security-group-rule";
import { Subnet } from "@cdktn/provider-aws/lib/subnet";
import { Vpc as AwsVpc } from "@cdktn/provider-aws/lib/vpc";
import { NullProvider } from "@cdktn/provider-null/lib/provider";
import { Resource } from "@cdktn/provider-null/lib/resource";
import { Construct } from "constructs";

interface SubnetConfig {
  cidrBlock: string;
  az: string;
  name: string;
  type: string;
  tags?: { [key: string]: string };
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
  tags?: { [key: string]: string };
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
  vpcTags?: { [key: string]: string };
  subnets: SubnetConfig[];
  securityGroups: SecurityGroupConfig[];
  defaultRouteTableName: string;
  ec2ICEndpoint: ec2InstanceConnectEndpointsConfig;
  natGateway: {
    enable: boolean;
    name: string;
    tags?: { [key: string]: string };
  };
  routeTables: {
    public: {
      name: string;
      associatedSubnetNames: string[];
      tags?: { [key: string]: string };
    };
    private: {
      name: string;
      associatedSubnetNames: string[];
      tags?: { [key: string]: string };
    };
  };
}

export function createAwsVpcResources(
  scope: Construct,
  provider: AwsProvider,
  params: AwsResourcesParams
) {
  // For ensuring power equality when re-running
  new NullProvider(scope, "null-provider-vpc", {
    alias: "null-vpc",
  });

  // vpc
  const vpc = new AwsVpc(scope, "awsVpc", {
    provider: provider,
    cidrBlock: params.vpcCidrBlock,
    enableDnsHostnames: true,
    enableDnsSupport: true,
    tags: {
      Name: params.vpcName,
      ...(params.vpcTags || {}),
    },
  });

  // Internet Gateway
  const igw = new InternetGateway(scope, "internetGateway", {
    provider: provider,
    vpcId: vpc.id,
    tags: {
      Name: `${params.vpcName}-igw`,
    },
  });

  // subnets
  const subnets: Subnet[] = [];
  const subnetsByName: Record<string, Subnet> = {};
  const publicSubnets: Subnet[] = [];
  const privateSubnets: Subnet[] = [];

  params.subnets.forEach((subnetConfig, index) => {
    const subnetResource = new Subnet(scope, `awsSubnet${index}`, {
      provider: provider,
      vpcId: vpc.id,
      cidrBlock: subnetConfig.cidrBlock,
      availabilityZone: subnetConfig.az,
      tags: {
        Name: subnetConfig.name,
        ...(subnetConfig.tags || {}),
      },
    });
    subnets.push(subnetResource);
    subnetsByName[subnetConfig.name] = subnetResource;

    subnetConfig.type === "public"
      ? publicSubnets.push(subnetResource)
      : privateSubnets.push(subnetResource);
  });

  // Default Route Table add name
  new DefaultRouteTable(scope, "defaultRouteTable", {
    provider: provider,
    defaultRouteTableId: vpc.defaultRouteTableId,
    tags: {
      Name: params.defaultRouteTableName,
    },
  });

  // Public Route Table
  const publicRouteTable = new RouteTable(scope, "publicRouteTable", {
    provider: provider,
    vpcId: vpc.id,
    tags: {
      Name: params.routeTables.public.name,
      ...(params.routeTables.public.tags || {}),
    },
  });

  new Route(scope, "publicInternetRoute", {
    provider: provider,
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: igw.id,
  });

  params.routeTables.public.associatedSubnetNames.forEach(
    (subnetName, index) => {
      const subnet = subnetsByName[subnetName];
      if (subnet) {
        new RouteTableAssociation(scope, `publicSubnetAssociation${index}`, {
          provider: provider,
          subnetId: subnet.id,
          routeTableId: publicRouteTable.id,
        });
      }
    }
  );

  let natGateway: NatGateway | undefined;

  // Elastic IP for NAT Gateway
  if (params.natGateway.enable) {
    const eip = new Eip(scope, "AwsNatGatewayEip", {
      provider: provider,
      tags: {
        Name: `${params.natGateway.name}-eip`,
      },
    });

    // NAT Gateway
    natGateway = new NatGateway(scope, "AwsNatGateway", {
      provider: provider,
      allocationId: eip.id,
      subnetId: publicSubnets[0].id,
      tags: {
        Name: params.natGateway.name,
        ...(params.natGateway.tags || {}),
      },
    });
  }

  // Private Route Table
  const privateRouteTable = new RouteTable(scope, "privateRouteTable", {
    provider: provider,
    vpcId: vpc.id,
    tags: {
      Name: params.routeTables.private.name,
      ...(params.routeTables.private.tags || {}),
    },
  });

  if (natGateway) {
    new Route(scope, "privateNatGatewayRoute", {
      provider: provider,
      routeTableId: privateRouteTable.id,
      destinationCidrBlock: "0.0.0.0/0",
      natGatewayId: natGateway.id,
    });
  }

  params.routeTables.private.associatedSubnetNames.forEach(
    (subnetName, index) => {
      const subnet = subnetsByName[subnetName];
      if (subnet) {
        new RouteTableAssociation(scope, `privateSubnetAssociation${index}`, {
          provider: provider,
          subnetId: subnet.id,
          routeTableId: privateRouteTable.id,
        });
      }
    }
  );

  // security groups
  const securityGroups = params.securityGroups.map((sgConfig, index) => {
    const sg = new SecurityGroup(scope, `awsSecurityGroup-${index}`, {
      provider: provider,
      vpcId: vpc.id,
      name: sgConfig.name,
      ingress:
        sgConfig.ingress.length > 0
          ? sgConfig.ingress.map((rule) => ({
              fromPort: rule.fromPort,
              toPort: rule.toPort,
              protocol: rule.protocol,
              cidrBlocks: rule.cidrBlocks || [],
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
        ...(sgConfig.tags || {}),
      },
    });
    return sg;
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
    const rule = new SecurityGroupRule(
      scope,
      `ec2InstanceConnectIngressRule-${params.ec2ICEndpoint.securityGroupNames[0]}-22-tcp`,
      {
        provider: provider,
        type: "ingress",
        fromPort: 22,
        toPort: 22,
        protocol: "tcp",
        sourceSecurityGroupId:
          securityGroupMapping[params.ec2ICEndpoint.securityGroupNames[0]],
        securityGroupId: ec2SecurityGroup.id,
        description: "Allow SSH from EC2 Instance Connect Endpoint",
        dependsOn: [ec2InstanceConnectEndpoint, ec2SecurityGroup],
        lifecycle: {
          createBeforeDestroy: true,
          ignoreChanges: ["security_group_id", "source_security_group_id"],
        },
      }
    );
    ec2SecurityGroup.addOverride("lifecycle.ignore_changes", ["ingress"]);
    new Resource(scope, `ec2-connect-rule-guard`, {
      dependsOn: [rule],
      triggers: {
        sg_id: ec2SecurityGroup.id,
        last_updated: "static-last-updated-value",
      },
    });
  }

  return {
    vpc,
    subnets,
    subnetsByName,
    publicSubnets,
    privateSubnets,
    igw,
    natGateway,
    publicRouteTable,
    privateRouteTable,
    securityGroups,
    securityGroupMapping,
    ec2InstanceConnectEndpoint,
  };
}
