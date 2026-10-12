import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { RoleAssignment } from "@cdktn/provider-azurerm/lib/role-assignment";
import { UserAssignedIdentity } from "@cdktn/provider-azurerm/lib/user-assigned-identity";
import { Construct } from "constructs";
import { idPart } from "../../utils/naming";

/** A built-in role on a scope (resource ID). `key` names the assignment. */
export interface AzureRoleGrant {
  key: string;
  role: string;
  scope: string;
}

/**
 * Role assignments for an existing principal (e.g. the identity of a
 * Managed DevOps Pool). The identity running cdktn needs Owner or User
 * Access Administrator to create them.
 */
export function createAzureRoleAssignments(
  scope: Construct,
  provider: AzurermProvider,
  idPrefix: string,
  principalId: string,
  grants: AzureRoleGrant[],
): RoleAssignment[] {
  return grants.map(
    (grant) =>
      new RoleAssignment(scope, `role-${idPart(idPrefix)}-${idPart(grant.key)}`, {
        provider,
        scope: grant.scope,
        roleDefinitionName: grant.role,
        principalId,
        principalType: "ServicePrincipal",
      }),
  );
}

/** User-assigned identity with the given roles. */
export function createAzureIdentityWithRoles(
  scope: Construct,
  provider: AzurermProvider,
  config: {
    name: string;
    resourceGroupName: string;
    location: string;
    grants: AzureRoleGrant[];
  },
): { identity: UserAssignedIdentity; roleAssignments: RoleAssignment[] } {
  const identity = new UserAssignedIdentity(scope, `identity-${idPart(config.name)}`, {
    provider,
    name: config.name,
    resourceGroupName: config.resourceGroupName,
    location: config.location,
  });
  const roleAssignments = createAzureRoleAssignments(
    scope,
    provider,
    config.name,
    identity.principalId,
    config.grants,
  );
  return { identity, roleAssignments };
}
