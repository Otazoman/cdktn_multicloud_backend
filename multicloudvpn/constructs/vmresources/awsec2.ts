import { Instance } from "@cdktn/provider-aws/lib/instance";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Construct } from "constructs";

interface Ec2InstanceConfig {
  ami: string;
  instanceType: string;
  keyName: string;
  tags: {
    Name: string;
  };
  subnetKey: string;
  securityGroupIds: string[];
  build: boolean;
  diskSize?: number;
}

interface CreateEc2InstancesParams {
  instanceConfigs: Ec2InstanceConfig[];
  subnets: Record<string, { id: string; name: string }>;
}

export function createAwsEc2Instances(
  scope: Construct,
  provider: AwsProvider,
  params: CreateEc2InstancesParams
) {
  const instances = params.instanceConfigs
    .filter((config) => config.build)
    .map((config) => {
      const targetSubnet = params.subnets[config.subnetKey];

      if (!targetSubnet) {
        throw new Error(
          `Subnet with key ${config.subnetKey} not found for EC2 Instance ${config.tags.Name}`
        );
      }
      return new Instance(scope, `ec2Instance-${config.tags.Name}`, {
        provider: provider,
        ami: config.ami,
        instanceType: config.instanceType,
        keyName: config.keyName,
        subnetId: targetSubnet.id,
        vpcSecurityGroupIds: config.securityGroupIds,
        rootBlockDevice: {
          volumeSize: config.diskSize,
          tags: config.tags,
        },
        tags: config.tags,
      });
    });

  return instances;
}
