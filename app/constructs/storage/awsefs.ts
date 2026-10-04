import { EfsAccessPoint } from "@cdktn/provider-aws/lib/efs-access-point";
import { EfsFileSystem } from "@cdktn/provider-aws/lib/efs-file-system";
import { EfsMountTarget } from "@cdktn/provider-aws/lib/efs-mount-target";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Construct } from "constructs";
import { resourceName } from "../../utils/naming";

/**
 * Configuration for EFS Access Point
 */
interface EfsAccessPointConfig {
  /**
   * Construct ID key (Terraform address). Defaults to `name`. To rename
   * the resource without replacing it in state, set this to the old value.
   */
  key?: string;
  name: string;
  /** Actual name (Name tag). Default: <project>-aws-efs-access-point-<name> */
  resourceName?: string;
  path?: string;
  posixUser?: {
    gid: number;
    uid: number;
    secondaryGids?: number[];
  };
  creationInfo?: {
    ownerGid: number;
    ownerUid: number;
    permissions: string;
  };
}

/**
 * Configuration for EFS File System
 */
interface EfsConfig {
  /**
   * Construct ID key (Terraform address). Defaults to `name`. To rename
   * the resource without replacing it in state, set this to the old value.
   */
  key?: string;
  name: string;
  encrypted?: boolean;
  performanceMode?: "generalPurpose" | "maxIO";
  throughputMode?: "bursting" | "provisioned" | "elastic";
  provisionedThroughputInMibps?: number;
  subnetKeys: string[];
  securityGroupIds: string[];
  tags: {
    Name: string;
  };
  accessPoints?: EfsAccessPointConfig[]; // Added for Access Point creation
  build: boolean;
}

interface CreateEfsParams {
  efsConfigs: EfsConfig[];
  subnets: Record<string, { id: string }>;
}

/**
 * Function to create AWS EFS resources including File Systems, Mount Targets, and Access Points.
 */
export function createAwsEfs(
  scope: Construct,
  provider: AwsProvider,
  params: CreateEfsParams,
) {
  const efsResources = params.efsConfigs
    .filter((config) => config.build)
    .map((config) => {
      // 1. Create EFS File System
      const fileSystem = new EfsFileSystem(scope, `efs-${config.key ?? config.name}`, {
        provider: provider,
        encrypted: config.encrypted ?? true,
        performanceMode: config.performanceMode,
        throughputMode: config.throughputMode,
        provisionedThroughputInMibps: config.provisionedThroughputInMibps,
        tags: config.tags,
      });

      // 2. Create Mount Targets for each specified subnet
      const mountTargets = config.subnetKeys.map((key) => {
        const targetSubnet = params.subnets[key];
        if (!targetSubnet) {
          throw new Error(
            `Subnet with key ${key} not found for EFS ${config.name}`,
          );
        }

        return new EfsMountTarget(scope, `efsMount-${config.key ?? config.name}-${key}`, {
          provider: provider,
          fileSystemId: fileSystem.id,
          subnetId: targetSubnet.id,
          securityGroups: config.securityGroupIds,
        });
      });

      // 3. Create Access Points if defined in config
      const accessPoints = (config.accessPoints || []).map((apConfig) => {
        return new EfsAccessPoint(
          scope,
          `efsAp-${config.key ?? config.name}-${apConfig.key ?? apConfig.name}`,
          {
            provider: provider,
            fileSystemId: fileSystem.id,
            rootDirectory: {
              path: apConfig.path || "/",
              creationInfo: apConfig.creationInfo
                ? {
                    ownerGid: apConfig.creationInfo.ownerGid,
                    ownerUid: apConfig.creationInfo.ownerUid,
                    permissions: apConfig.creationInfo.permissions,
                  }
                : undefined,
            },
            posixUser: apConfig.posixUser
              ? {
                  gid: apConfig.posixUser.gid,
                  uid: apConfig.posixUser.uid,
                  secondaryGids: apConfig.posixUser.secondaryGids,
                }
              : undefined,
            tags: {
              Name: resourceName(
                apConfig.resourceName,
                "aws",
                "efs-access-point",
                apConfig.name,
              ),
            },
          },
        );
      });

      return { fileSystem, mountTargets, accessPoints };
    });

  return efsResources;
}
