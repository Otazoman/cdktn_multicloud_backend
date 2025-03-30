import { ComputeInstance } from "@cdktf/provider-google/lib/compute-instance";
import { ComputeNetwork as GoogleVpc } from "@cdktf/provider-google/lib/compute-network";
import { ComputeSubnetwork } from "@cdktf/provider-google/lib/compute-subnetwork";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
import { Construct } from "constructs";

interface GceInstanceConfig {
  name: string;
  machineType: string;
  zone: string;
  tags: string[];
  bootDiskImage: string;
  bootDiskSize: number;
  bootDiskType: string;
  bootDiskDeviceName: string;
  subnetworkName: string;
  serviceAccountScopes: string[];
}

interface CreateGceInstancesParams {
  project: string;
  instanceConfigs: GceInstanceConfig[];
  vpcName: string;
}

export function createGoogleGceInstances(
  scope: Construct,
  provider: GoogleProvider,
  params: CreateGceInstancesParams,
  vpc: GoogleVpc,
  subnets: ComputeSubnetwork[]
) {
  const instances = params.instanceConfigs.map((config, index) => {
    return new ComputeInstance(scope, `gceInstance${index}`, {
      provider: provider,
      project: params.project,
      name: config.name,
      machineType: config.machineType,
      zone: config.zone,
      tags: config.tags,
      bootDisk: {
        initializeParams: {
          image: config.bootDiskImage,
          size: config.bootDiskSize,
          type: config.bootDiskType,
        },
        deviceName: config.bootDiskDeviceName,
      },
      networkInterface: [
        {
          subnetwork: `${params.vpcName}-${config.subnetworkName}`,
        },
      ],
      serviceAccount: {
        scopes: config.serviceAccountScopes,
      },
      dependsOn: [vpc, ...subnets],
    });
  });

  return instances;
}
