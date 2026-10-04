import { Instance } from "@cdktn/provider-aws/lib/instance";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Construct } from "constructs";
import * as fs from "fs";
import { Base64 } from "js-base64";


interface Ec2InstanceConfig {
  /**
   * Construct ID key (Terraform address). Defaults to `tags.Name`. To rename
   * the resource without replacing it in state, set this to the old value.
   */
  key?: string;
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
  userDataScriptPath?: string;
}

interface CreateEc2InstancesParams {
  instanceConfigs: Ec2InstanceConfig[];
  subnets: Record<string, { id: string }>;
}

// Userdata
function getUserDataBase64(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }
  try {
    const scriptContent = fs.readFileSync(path, "utf-8");
    return Base64.encode(scriptContent);
  } catch (error) {
    console.error(`Error reading user data script at ${path}:`, error);
    throw new Error(`Failed to read user data script at ${path}`);
  }
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

      const userData = getUserDataBase64(config.userDataScriptPath);

      return new Instance(scope, `ec2Instance-${config.key ?? config.tags.Name}`, {
        provider: provider,
        ami: config.ami,
        instanceType: config.instanceType,
        keyName: config.keyName,
        subnetId: targetSubnet.id,
        vpcSecurityGroupIds: config.securityGroupIds,
        userDataBase64: userData,
        rootBlockDevice: {
          volumeSize: config.diskSize,
          tags: config.tags,
        },
        tags: config.tags,
      });
    });

  return instances;
}
