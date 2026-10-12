import { byEnv, envScopedName } from "../environment";
import { LOCATION, RESOURCE_GROUP } from "./common";

/**
 * Azure Pipelines (FEAT-01 #4). Created when clouds.azure.features.cicd is
 * enabled.
 *
 * The build definition is azure-pipelines.yml of the application repository
 * (config/cicd.ts). It runs on a Managed DevOps Pool whose agents are joined
 * to the VNet (the ACR is reachable only through its private endpoint),
 * pushes the image to the ACR and updates the Container App.
 *
 * Done by hand before the deploy (docs/getting-started.md, "Azure"): the
 * Azure DevOps organization and project, the GitHub service connection, the
 * service principal of cdktn as an organization member, the resource
 * provider registrations and the VNet permissions of DevOpsInfrastructure.
 */
export const azureDevOpsConfig = {
  /** Azure DevOps organization (https://dev.azure.com/<organization>) */
  organization: byEnv({ default: "otazoman-multicloud" }),
  /** Project of the organization */
  project: byEnv({ default: "multicloud-api" }),
  /** GitHub service connection (GitHub App) of the project, looked up by name */
  githubServiceConnectionName: byEnv({ default: "github.com_Otazoman" }),

  /**
   * Object ID of the "DevOpsInfrastructure" service principal of the tenant
   * (it appears after Microsoft.DevOpsInfrastructure is registered). When
   * set, cdktn grants it Reader and Network Contributor on the VNet before
   * creating the pool. Kept in .env.<env> (tenant-specific; not in Git).
   */
  devOpsInfrastructurePrincipalId: process.env.AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID,

  resourceGroupName: RESOURCE_GROUP,
  location: LOCATION,

  /** Build agents: Managed DevOps Pool (VMs managed by Microsoft) */
  pool: {
    /** Pool name (Azure resource and Azure DevOps agent pool) */
    name: "multicloud-devops-pool",
    devCenterName: "multicloud-devcenter",
    devCenterProjectName: "multicloud-devcenter-project",
    /** Subnet of the agents (config/azure/vnet/subnets.ts), delegated to Microsoft.DevOpsInfrastructure/pools */
    subnetName: "devops-pool-subnet",
    /** VM size of an agent */
    vmSize: "Standard_D2ads_v5",
    /** Well-known image of the agents */
    image: "ubuntu-24.04",
    /** Agents running at the same time (also the Azure DevOps parallelism) */
    maximumConcurrency: 1,
    /**
     * Agents kept ready while idle. 0: an agent is created for each job and
     * no VM is billed while nothing is built.
     */
    standbyAgents: 0,
    /** User-assigned identity of the agents (pushes to the ACR, updates the Container App) */
    identityName: "multicloud-devops-pool-identity",
  },

  pipeline: {
    build: true,
    /** Pipeline name in Azure DevOps */
    name: "multicloud-api-deploy",
    /** Build definition in the application repository */
    ymlPath: "azure-pipelines.yml",
    /**
     * Deploy target. containerAppName: name in containerapps.ts (Terraform
     * then ignores its image); acrName: registry in devops_acr_config.ts.
     */
    deployTarget: {
      containerAppName: "backend-api-service",
      // Same value as the name in devops_acr_config.ts
      acrName: envScopedName("mycompanyacr001", { hyphen: false }),
      /** Identity the Container App pulls the image with (AcrPull only) */
      pullIdentityName: "backend-api-service-acr-pull",
    },
  },
};
