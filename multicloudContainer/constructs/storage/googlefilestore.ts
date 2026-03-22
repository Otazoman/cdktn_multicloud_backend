import { ComputeNetwork as GoogleVpc } from "@cdktn/provider-google/lib/compute-network";
import { ComputeSubnetwork } from "@cdktn/provider-google/lib/compute-subnetwork";
import { FilestoreInstance } from "@cdktn/provider-google/lib/filestore-instance";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { ITerraformDependable } from "cdktn";
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
  /**
   * Terraform resources that must be fully applied before any Filestore instance
   * is created. Pass psa.connection and psa.peeringRoutesConfig here so that
   * the ServiceNetworkingConnection and its peering routes are both complete
   * before GCP validates the PRIVATE_SERVICE_ACCESS network config.
   */
  psaDependencies?: ITerraformDependable[];
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
            // Use the named IP range from the instance config.
            // For PRIVATE_SERVICE_ACCESS, this must be the ComputeGlobalAddress resource name
            // (e.g. "gcp-psa-filestore-range"), not a CIDR string.
            // For DIRECT_PEERING, this can be a CIDR string or left undefined.
            reservedIpRange: config.reservedIpRange,
          },
        ],

        // Ensure Filestore is created after the network infrastructure is ready.
        // psaDependencies (ServiceNetworkingConnection + ComputeNetworkPeeringRoutesConfig)
        // must also be listed here as TerraformResource references so that the generated
        // cdk.tf.json depends_on block contains them explicitly.  Using only
        // node.addDependency() on the parent Construct is NOT sufficient because CDKTF
        // only serialises ITerraformDependable references into depends_on.
        dependsOn: [vpc, ...subnets, ...(params.psaDependencies ?? [])],
      });
    });

  return instances.map((inst) => ({ instance: inst }));
}
