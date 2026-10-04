import { ProjectIamCustomRole } from "@cdktn/provider-google/lib/project-iam-custom-role";
import { ProjectIamMember } from "@cdktn/provider-google/lib/project-iam-member";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { ServiceAccount } from "@cdktn/provider-google/lib/service-account";
import { Construct } from "constructs";

/**
 * Configuration for a Google Cloud IAM Custom Role.
 */
export interface GcpCustomRoleDefinition {
  /** The unique ID to use for this role (e.g., "myCustomRole"). */
  roleId: string;
  /** The human-readable title of the custom role. */
  title: string;
  /** The list of IAM permissions to assign to this role. */
  permissions: string[];
  /** Optional description of the custom role. */
  description?: string;
}

/**
 * Configuration for a Google Cloud Service Account.
 */
export interface GcpServiceAccountDefinition {
  /** The account id which will be used to generate the service account email. */
  accountId: string;
  /** The human-readable display name for the service account. */
  displayName?: string;
  /** Optional list of roles (pre-defined or custom) to bind to this service account at the project level. */
  projectRoles?: string[];
}

/**
 * Configuration interface for the GcpIamResources construct.
 */
export interface GcpIamResourcesConfig {
  /** Google Cloud Project ID where resources will be provisioned. */
  projectId: string;
  /** Array of custom IAM role definitions. Optional. */
  customRoles?: GcpCustomRoleDefinition[];
  /** Array of Service Account definitions. Optional. */
  serviceAccounts?: GcpServiceAccountDefinition[];
  /** Optional lifecycle hooks or custom operations to execute during creation. */
  hooks?: {
    /** Hook invoked right after a service account is provisioned. */
    onServiceAccountCreated?: (
      sa: ServiceAccount,
      definition: GcpServiceAccountDefinition,
    ) => void;
    /** Hook invoked right after a custom role is provisioned. */
    onCustomRoleCreated?: (
      role: ProjectIamCustomRole,
      definition: GcpCustomRoleDefinition,
    ) => void;
  };
}

/**
 * A flexible construct to manage independent Google Cloud Service Accounts,
 * Custom IAM Roles, and Project-level IAM bindings with lifecycle hooks.
 */
export class GcpIamResources extends Construct {
  /** Map of created ProjectIamCustomRole instances, accessible by their roleId. */
  public readonly createdCustomRoles: Record<string, ProjectIamCustomRole> = {};
  /** Map of created ServiceAccount instances, accessible by their accountId. */
  public readonly createdServiceAccounts: Record<string, ServiceAccount> = {};

  constructor(
    scope: Construct,
    id: string,
    provider: GoogleProvider,
    config: GcpIamResourcesConfig,
  ) {
    super(scope, id);

    // 1. Independent IAM Custom Roles Creation
    if (config.customRoles) {
      config.customRoles.forEach((roleDef, index) => {
        const sanitizedId = roleDef.roleId.replace(/[^a-zA-Z0-9]/g, "-");

        // Fixed: Use ProjectIamCustomRole instead of IamCustomRole
        const customRole = new ProjectIamCustomRole(
          this,
          `gcp-custom-role-${sanitizedId}-${index}`,
          {
            provider: provider,
            project: config.projectId,
            roleId: roleDef.roleId,
            title: roleDef.title,
            description: roleDef.description,
            permissions: roleDef.permissions,
          },
        );

        this.createdCustomRoles[roleDef.roleId] = customRole;

        if (config.hooks?.onCustomRoleCreated) {
          config.hooks.onCustomRoleCreated(customRole, roleDef);
        }
      });
    }

    // 2. Service Accounts Creation & Project IAM Bindings
    if (config.serviceAccounts) {
      config.serviceAccounts.forEach((saDef, index) => {
        const sanitizedId = saDef.accountId.replace(/[^a-zA-Z0-9]/g, "-");

        const sa = new ServiceAccount(this, `gcp-sa-${sanitizedId}-${index}`, {
          provider: provider,
          accountId: saDef.accountId,
          displayName: saDef.displayName,
        });

        this.createdServiceAccounts[saDef.accountId] = sa;

        if (config.hooks?.onServiceAccountCreated) {
          config.hooks.onServiceAccountCreated(sa, saDef);
        }

        // 3. Attach Roles to the Service Account (Project-level Binding)
        if (saDef.projectRoles && saDef.projectRoles.length > 0) {
          saDef.projectRoles.forEach((roleName, rIndex) => {
            const isLocalCustomRole = this.createdCustomRoles[roleName];
            const finalRoleName = isLocalCustomRole
              ? `projects/${config.projectId}/roles/${roleName}`
              : roleName;

            new ProjectIamMember(
              this,
              `gcp-project-iam-${sanitizedId}-${roleName.replace(
                /[^a-zA-Z0-9]/g,
                "-",
              )}-${rIndex}`,
              {
                provider: provider,
                project: config.projectId,
                role: finalRoleName,
                member: `serviceAccount:${sa.email}`,
              },
            );
          });
        }
      });
    }
  }
}
