import { ComputeNetwork as GoogleVpc } from "@cdktn/provider-google/lib/compute-network";
import { ComputeSubnetwork } from "@cdktn/provider-google/lib/compute-subnetwork";
import { FilestoreInstance } from "@cdktn/provider-google/lib/filestore-instance";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";

interface FilestoreConfig {
  name: string;
  location: string; // e.g., "asia-northeast1-a"
  tier:
    | "BASIC_HDD"
    | "BASIC_SSD"
    | "HIGH_SCALE_SSD"
    | "ENTERPRISE"
    | "ZONAL"
    | "REGIONAL";

  /**
   * File share configuration.
   * Filestore supports only one file share per instance for most tiers.
   */
  fileShare: {
    name: string; // The name of the fileshare (e.g., "vol1")
    capacityGb: number; // Capacity in GiB
  };

  /**
   * Network configuration.
   */
  networkName: string; // VPC Name
  connectMode?: "DIRECT_PEERING" | "PRIVATE_SERVICE_ACCESS";
  reservedIpRange?: string; // e.g., "10.0.0.0/29"

  labels?: { [key: string]: string };
  build: boolean;
}

interface CreateFilestoreParams {
  project: string;
  filestoreConfigs: FilestoreConfig[];
}

export function createGoogleFilestoreInstances(
  scope: Construct,
  provider: GoogleProvider,
  params: CreateFilestoreParams,
  vpc: GoogleVpc,
  subnets: ComputeSubnetwork[],
) {
  const instances = params.filestoreConfigs
    .filter((config) => config.build)
    .map((config, index) => {
      return new FilestoreInstance(scope, `filestoreInstance${index}`, {
        provider: provider,
        project: params.project,
        name: config.name,
        location: config.location,
        tier: config.tier,
        labels: config.labels,

        fileShares: {
          name: config.fileShare.name,
          capacityGb: config.fileShare.capacityGb,
        },

        networks: [
          {
            network: vpc.name,
            modes: ["MODE_IPV4"],
            connectMode: config.connectMode,
            reservedIpRange: config.reservedIpRange,
          },
        ],

        // Ensure Filestore is created after the network infrastructure is ready
        dependsOn: [vpc, ...subnets],
      });
    });

  return instances.map((inst) => ({ instance: inst }));
}
