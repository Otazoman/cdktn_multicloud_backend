import { DevCenter } from "@cdktn/provider-azurerm/lib/dev-center";
import { DevCenterProject } from "@cdktn/provider-azurerm/lib/dev-center-project";
import { ManagedDevopsPool } from "@cdktn/provider-azurerm/lib/managed-devops-pool";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { UserAssignedIdentity } from "@cdktn/provider-azurerm/lib/user-assigned-identity";
import { Construct } from "constructs";
import { idPart } from "../../utils/naming";

export interface AzureDevOpsPoolConfig {
  /**
   * Construct ID key (Terraform address). Defaults to `name`. To rename
   * the resource without replacing it in state, set this to the old value.
   */
  key?: string;
  /** Pool name (Azure resource and Azure DevOps agent pool) */
  name: string;
  resourceGroupName: string;
  location: string;
  devCenterName: string;
  devCenterProjectName: string;
  /** Azure DevOps organization URL (https://dev.azure.com/<organization>) */
  organizationUrl: string;
  /** Projects of the organization that may use the pool */
  projects: string[];
  /** Subnet of the agents (delegated to Microsoft.DevOpsInfrastructure/pools) */
  subnetId: string;
  vmSize: string;
  /** Well-known image name, e.g. "ubuntu-24.04" */
  image: string;
  maximumConcurrency: number;
  /** Agents kept ready while idle (0: none) */
  standbyAgents: number;
  /** User-assigned identity of the agents */
  identityName: string;
  tags?: { [key: string]: string };
}

export interface AzureDevOpsPoolOutput {
  pool: ManagedDevopsPool;
  /** Identity of the agents; grant it the roles the builds need */
  identity: UserAssignedIdentity;
}

/**
 * Managed DevOps Pool: build agents for Azure Pipelines, created by
 * Microsoft on demand in the given subnet. The pool registers itself as an
 * agent pool of the Azure DevOps organization, so the identity running
 * cdktn must be allowed to create agent pools there.
 */
export function createAzureDevOpsPool(
  scope: Construct,
  provider: AzurermProvider,
  config: AzureDevOpsPoolConfig,
): AzureDevOpsPoolOutput {
  const id = idPart(config.key ?? config.name);

  const devCenter = new DevCenter(scope, `devcenter-${id}`, {
    provider,
    name: config.devCenterName,
    resourceGroupName: config.resourceGroupName,
    location: config.location,
    tags: config.tags,
  });

  const devCenterProject = new DevCenterProject(scope, `devcenter-project-${id}`, {
    provider,
    name: config.devCenterProjectName,
    resourceGroupName: config.resourceGroupName,
    location: config.location,
    devCenterId: devCenter.id,
    tags: config.tags,
  });

  const identity = new UserAssignedIdentity(scope, `devops-pool-identity-${id}`, {
    provider,
    name: config.identityName,
    resourceGroupName: config.resourceGroupName,
    location: config.location,
    tags: config.tags,
  });

  const pool = new ManagedDevopsPool(scope, `devops-pool-${id}`, {
    provider,
    name: config.name,
    resourceGroupName: config.resourceGroupName,
    location: config.location,
    devCenterProjectId: devCenterProject.id,
    maximumConcurrency: config.maximumConcurrency,
    azureDevopsOrganization: {
      organization: [
        {
          url: config.organizationUrl,
          projects: config.projects,
          parallelism: config.maximumConcurrency,
        },
      ],
    },
    identity: { type: "UserAssigned", identityIds: [identity.id] },
    statelessAgent:
      config.standbyAgents > 0
        ? { manualResourcePrediction: { allWeekSchedule: config.standbyAgents } }
        : {},
    virtualMachineScaleSetFabric: {
      skuName: config.vmSize,
      image: [{ wellKnownImageName: config.image }],
      subnetId: config.subnetId,
    },
    tags: config.tags,
  });

  return { pool, identity };
}
