import { PrivateDnsZone } from "@cdktn/provider-azurerm/lib/private-dns-zone";
import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";

import {
  azureAcaConfigs,
  azureDevOpsAcrConfigs,
  azureDevOpsConfig,
} from "../../config/azure/azuresettings";
import { appRepository, cicdTrigger } from "../../config/cicd";
import { isFeatureEnabled } from "../../config/features";
import { createAzureDevOpsAcrResources } from "../../constructs/cicd/azuredevopsacr";
import { createAzureDevOpsPipeline } from "../../constructs/cicd/azuredevopspipeline";
import { createAzureDevOpsPool } from "../../constructs/cicd/azuredevopspool";
import { createAzureRoleAssignments } from "../../constructs/iam/azureidentity";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { AzureBuildContext } from "./context";

/** 5.5. Container Registry (feature: cicd). Runs before containers, which pull from these registries */
export function createAzureCicd(ctx: AzureBuildContext): void {
  const { scope, azureProvider, azureVnetResources, acrRegistryMap } = ctx;

  // ──────────────────────────────────────────────
  // 5.5. Azure DevOps / ACR
  // ──────────────────────────────────────────────
  let sharedAcrPrivateDnsZone: PrivateDnsZone | undefined = undefined;

  if (isFeatureEnabled("azure", "cicd")) {
    azureDevOpsAcrConfigs
      .filter((c) => c.build)
      .forEach((config) => {
        const subnetResource = (
          azureVnetResources.subnets
        )[config.subnetName];
        const subnetId: string = subnetResource?.id ?? subnetResource ?? "";

        if (!subnetId) {
          throw new Error(
            `Subnet ${config.subnetName} not found for ACR ${config.name}`,
          );
        }

        // Pass the shared Private DNS Zone to follow the "pass-and-reuse" pattern
        const acrRes = createAzureDevOpsAcrResources(
          scope,
          azureProvider,
          {
            ...config,
            subnetId,
            virtualNetwork: azureVnetResources.vnet as VirtualNetwork,
          },
          sharedAcrPrivateDnsZone,
        );

        // Capture the first created Private DNS Zone to pass into subsequent iterations
        if (!sharedAcrPrivateDnsZone && acrRes.privateDnsZone) {
          sharedAcrPrivateDnsZone = acrRes.privateDnsZone;
        }

        acrRegistryMap.set(config.name, acrRes.registry);

        // Ensure explicit execution dependency ordering between network layers and resources
        addTerraformDependency(acrRes.registry, azureVnetResources.vnet);
        addTerraformDependency(acrRes.privateEndpoint, subnetResource);

        // If a new Private DNS Zone was generated or linked inside the construct,
        // guarantee it completes setup before the Private Endpoint tries to bind to it
        if (acrRes.privateDnsZone) {
          addTerraformDependency(acrRes.privateEndpoint, acrRes.privateDnsZone);
        }
      });
  }

}

/**
 * Deploy target of the Azure pipeline (feature: cicd): the Container App
 * name and the registry it pulls from, or undefined when the pipeline is not
 * built. Used by createAzureContainers (image ignored, pull from the ACR).
 */
export function azureCicdDeployTarget():
  | { containerAppName: string; acrName: string; pullIdentityName: string }
  | undefined {
  if (!isFeatureEnabled("azure", "cicd") || !azureDevOpsConfig.pipeline.build) {
    return undefined;
  }
  return azureDevOpsConfig.pipeline.deployTarget;
}

/**
 * 7.5. Azure Pipelines (feature: cicd): Managed DevOps Pool, its identity
 * and roles, and the pipeline in Azure DevOps. Runs after the containers it
 * deploys to.
 */
export function createAzurePipelines(ctx: AzureBuildContext): void {
  const target = azureCicdDeployTarget();
  if (!target) return;

  const { scope, providers, azureProvider, azureVnetResources, acrRegistryMap, containerApps, journalPruneJobs } = ctx;
  const config = azureDevOpsConfig;
  const label = `Azure pipeline "${config.pipeline.name}" (config/azure/cicd.ts)`;

  const registry = acrRegistryMap.get(target.acrName);
  if (!registry) {
    throw new Error(
      `${label}: ACR "${target.acrName}" not found (or build: false) in config/azure/devops_acr_config.ts`,
    );
  }
  const app = containerApps.get(target.containerAppName);
  const appConfig = azureAcaConfigs.find((c) => c.build && c.name === target.containerAppName);
  if (!app || !appConfig) {
    throw new Error(
      `${label}: Container App "${target.containerAppName}" not found (or build: false, or ` +
        `containers disabled) in config/azure/containerapps.ts`,
    );
  }
  const subnet = azureVnetResources.subnets[config.pool.subnetName];
  if (!subnet) {
    throw new Error(`${label}: subnet "${config.pool.subnetName}" not found in config/azure/vnet/subnets.ts`);
  }

  // The Managed DevOps Pool service joins the agents to the VNet
  const vnetRoles = config.devOpsInfrastructurePrincipalId
    ? createAzureRoleAssignments(scope, azureProvider, "devops-infrastructure", config.devOpsInfrastructurePrincipalId, [
        { key: "vnet-reader", role: "Reader", scope: azureVnetResources.vnet.id },
        { key: "vnet-network-contributor", role: "Network Contributor", scope: azureVnetResources.vnet.id },
      ])
    : [];
  if (vnetRoles.length === 0) {
    console.warn(
      `⚠️  Warning: AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID is not set (.env.<env>); creating the ` +
        `Managed DevOps Pool fails unless DevOpsInfrastructure already has Reader and Network ` +
        `Contributor on the VNet (docs/getting-started.md).`,
    );
  }

  // Build agents (Azure side)
  const { pool, identity } = createAzureDevOpsPool(scope, azureProvider, {
    ...config.pool,
    resourceGroupName: config.resourceGroupName,
    location: config.location,
    organizationUrl: `https://dev.azure.com/${config.organization}`,
    projects: [config.project],
    subnetId: subnet.id,
  });
  addTerraformDependency(pool, subnet);
  vnetRoles.forEach((role) => addTerraformDependency(pool, role));

  // The agents push the image and update the Container App, and the
  // journal pruning job that runs the same image
  const pruneJob = journalPruneJobs.get(target.containerAppName);
  const roles = createAzureRoleAssignments(scope, azureProvider, config.pool.identityName, identity.principalId, [
    { key: "acr-push", role: "AcrPush", scope: registry.id },
    { key: "containerapp", role: "Contributor", scope: app.id },
    ...(pruneJob ? [{ key: "journal-prune-job", role: "Contributor", scope: pruneJob.id }] : []),
  ]);

  // Pipeline (Azure DevOps side)
  createAzureDevOpsPipeline(
    scope,
    providers.azuredevops(),
    {
      name: config.pipeline.name,
      project: config.project,
      githubServiceConnectionName: config.githubServiceConnectionName,
      repository: `${appRepository.owner}/${appRepository.name}`,
      ymlPath: config.pipeline.ymlPath,
      branches: cicdTrigger.branches,
      agentPoolName: config.pool.name,
      variables: {
        AZURE_CLIENT_ID: identity.clientId,
        ACR_NAME: registry.name,
        ACR_LOGIN_SERVER: registry.loginServer,
        RESOURCE_GROUP: appConfig.resourceGroupName,
        CONTAINER_APP_NAME: app.name,
        ...(pruneJob ? { PRUNE_JOB_NAME: pruneJob.name } : {}),
      },
    },
    [pool, ...roles],
  );
}

