import { DataAzurermClientConfig } from "@cdktn/provider-azurerm/lib/data-azurerm-client-config";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { RoleAssignment } from "@cdktn/provider-azurerm/lib/role-assignment";
import { RoleDefinition } from "@cdktn/provider-azurerm/lib/role-definition";
import { UserAssignedIdentity } from "@cdktn/provider-azurerm/lib/user-assigned-identity";
import { Construct } from "constructs";

/**
 * Configuration for an Azure Custom Role Definition.
 */
export interface AzureCustomRoleDefinition {
  /** The unique name of the custom role definition. */
  name: string;
  /** Optional description of the custom role. */
  description?: string;
  /** List of allowed actions (permissions) for this role. */
  actions: string[];
  /** List of disallowed actions (explicit denies) for this role. */
  notActions?: string[];
  /** Optional assignable scopes. If not provided, it defaults to the subscription scope. */
  assignableScopes?: string[];
}

/**
 * Configuration for an Azure User Assigned Managed Identity.
 */
export interface AzureManagedIdentityDefinition {
  /** The unique name of the user assigned identity. */
  name: string;
  /** Optional list of role names (built-in role names or local custom role names) to assign. */
  roles?: string[];
}

/**
 * Configuration interface for the AzureIamResources construct.
 */
export interface AzureIamResourcesConfig {
  /** The target scope where roles will be assigned (e.g., subscription ID or resource group ID). */
  scope: string;
  /** The location where the Managed Identities will be provisioned (e.g., "japaneast"). */
  location: string;
  /** The name of the Resource Group where the Managed Identities will reside. */
  resourceGroupName: string;
  /** Array of custom role definitions. Optional. */
  customRoles?: AzureCustomRoleDefinition[];
  /** Array of Managed Identity definitions. Optional. */
  managedIdentities?: AzureManagedIdentityDefinition[];
  /** Optional lifecycle hooks or custom operations to execute during creation. */
  hooks?: {
    /** Hook invoked right after a managed identity is provisioned. */
    onIdentityCreated?: (
      identity: UserAssignedIdentity,
      definition: AzureManagedIdentityDefinition,
    ) => void;
    /** Hook invoked right after a custom role definition is provisioned. */
    onRoleDefinitionCreated?: (
      roleDef: RoleDefinition,
      definition: AzureCustomRoleDefinition,
    ) => void;
  };
  /** Optional resource tags to apply to all created identities. */
  tags?: { [key: string]: string };
}

/**
 * A flexible construct to manage independent Azure Managed Identities,
 * Custom Role Definitions, and Role Assignments with lifecycle hooks.
 */
export class AzureIamResources extends Construct {
  /** Map of created RoleDefinition instances, accessible by their configured name. */
  public readonly createdRoleDefinitions: Record<string, RoleDefinition> = {};
  /** Map of created UserAssignedIdentity instances, accessible by their configured name. */
  public readonly createdIdentities: Record<string, UserAssignedIdentity> = {};

  constructor(
    scope: Construct,
    id: string,
    provider: AzurermProvider,
    config: AzureIamResourcesConfig,
  ) {
    super(scope, id);

    // Fixed: Use DataAzurermClientConfig instead of ClientConfig to fetch the current azure context
    const clientConfig = new DataAzurermClientConfig(
      this,
      "current-client-config",
      {
        provider: provider,
      },
    );

    // 1. Independent Azure Custom Role Definitions Creation
    if (config.customRoles) {
      config.customRoles.forEach((roleDef, index) => {
        const sanitizedId = roleDef.name.replace(/[^a-zA-Z0-9]/g, "-");

        // Dynamically reference the subscription ID from the Data Source fallback
        const scopes = roleDef.assignableScopes ?? [
          `/subscriptions/${clientConfig.subscriptionId}`,
        ];

        const azureRoleDef = new RoleDefinition(
          this,
          `azure-role-def-${sanitizedId}-${index}`,
          {
            provider: provider,
            name: roleDef.name,
            scope: config.scope,
            description: roleDef.description,
            permissions: [
              {
                actions: roleDef.actions,
                notActions: roleDef.notActions ?? [],
              },
            ],
            assignableScopes: scopes,
          },
        );

        this.createdRoleDefinitions[roleDef.name] = azureRoleDef;

        if (config.hooks?.onRoleDefinitionCreated) {
          config.hooks.onRoleDefinitionCreated(azureRoleDef, roleDef);
        }
      });
    }

    // 2. User Assigned Managed Identities Creation & Role Assignments
    if (config.managedIdentities) {
      config.managedIdentities.forEach((identityDef, index) => {
        const sanitizedId = identityDef.name.replace(/[^a-zA-Z0-9]/g, "-");

        const identity = new UserAssignedIdentity(
          this,
          `azure-identity-${sanitizedId}-${index}`,
          {
            provider: provider,
            name: identityDef.name,
            location: config.location,
            resourceGroupName: config.resourceGroupName,
            tags: config.tags,
          },
        );

        this.createdIdentities[identityDef.name] = identity;

        if (config.hooks?.onIdentityCreated) {
          config.hooks.onIdentityCreated(identity, identityDef);
        }

        // 3. Bind Roles to the Managed Identity (Role Assignment)
        if (identityDef.roles && identityDef.roles.length > 0) {
          identityDef.roles.forEach((roleName, rIndex) => {
            const localCustomRole = this.createdRoleDefinitions[roleName];

            const isLocalCustom = !!localCustomRole;
            const roleDefinitionId = isLocalCustom
              ? localCustomRole.roleDefinitionResourceId
              : undefined;
            const roleDefinitionName = isLocalCustom ? undefined : roleName;

            new RoleAssignment(
              this,
              `azure-role-assign-${sanitizedId}-${roleName.replace(
                /[^a-zA-Z0-9]/g,
                "-",
              )}-${rIndex}`,
              {
                provider: provider,
                scope: config.scope,
                principalId: identity.principalId,
                roleDefinitionId: roleDefinitionId,
                roleDefinitionName: roleDefinitionName,
              },
            );
          });
        }
      });
    }
  }
}
