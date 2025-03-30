import { Instance } from "@cdktf/provider-aws/lib/instance";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { Construct } from "constructs";

interface Ec2InstanceConfig {
  ami: string;
  instanceType: string;
  keyName: string;
  tags: {
    Name: string;
  };
  securityGroupIds: string[];
}

interface CreateEc2InstancesParams {
  instanceConfigs: Ec2InstanceConfig[];
  subnetIds: string[];
}

export function createAwsEc2Instances(
  scope: Construct,
  provider: AwsProvider,
  params: CreateEc2InstancesParams
) {
  const instances = params.instanceConfigs.map((config, index) => {
    return new Instance(scope, `ec2Instance${index}`, {
      provider: provider,
      ami: config.ami,
      instanceType: config.instanceType,
      keyName: config.keyName,
      subnetId: params.subnetIds[index % params.subnetIds.length],
      vpcSecurityGroupIds: config.securityGroupIds,
      tags: config.tags,
    });
  });

  return instances;
}
