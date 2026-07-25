import { IamPolicy } from "@cdktn/provider-aws/lib/iam-policy";
import { IamRole } from "@cdktn/provider-aws/lib/iam-role";
import { IamRolePolicy } from "@cdktn/provider-aws/lib/iam-role-policy"; // 💡 Added for managing separate inline policies
import { IamRolePolicyAttachment } from "@cdktn/provider-aws/lib/iam-role-policy-attachment";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Construct } from "constructs";

/**
 * Configuration for a standalone IAM Policy.
 */
export interface IamPolicyDefinition {
  /** The unique name of the IAM policy. */
  name: string;
  /** The policy document defining permissions. */
  policy: Record<string, any>;
  /** Optional description of the policy. */
  description?: string;
}

/**
 * Configuration for an Inline Policy embedded within a specific role.
 */
export interface IamInlinePolicyDefinition {
  /** The name of the inline policy. */
  name: string;
  /** The policy document defining permissions. */
  policy: Record<string, any>;
}

/**
 * Configuration for an IAM Role.
 */
export interface IamRoleDefinition {
  /** The unique name of the IAM role. */
  name: string;
  /** The trust policy document that grants an entity permission to assume the role. */
  assumeRolePolicy: Record<string, any>;
  /** Optional list of Managed Policy ARNs (AWS managed or existing customer managed). */
  managedPolicyArns?: string[];
  /** Optional list of keys pointing to custom standalone policies created within this construct. */
  customPolicyNames?: string[];
  /** Optional inline policies embedded directly into this role. */
  inlinePolicies?: IamInlinePolicyDefinition[];
}

/**
 * Configuration interface for the AwsIamResources construct.
 */
export interface AwsIamResourcesConfig {
  /** Array of standalone IAM policy definitions. Optional. */
  policies?: IamPolicyDefinition[];
  /** Array of IAM role definitions. Optional. */
  roles?: IamRoleDefinition[];
  /** Optional lifecycle hooks or custom operations to execute during creation. */
  hooks?: {
    /** Hook invoked right after a role is provisioned, but before attachments. */
    onRoleCreated?: (role: IamRole, definition: IamRoleDefinition) => void;
    /** Hook invoked right after a standalone policy is provisioned. */
    onPolicyCreated?: (
      policy: IamPolicy,
      definition: IamPolicyDefinition,
    ) => void;
  };
  /** Optional resource tags to apply to all created IAM roles and policies. */
  tags?: { [key: string]: string };
}

/**
 * A flexible construct to manage independent IAM Roles, standalone IAM Policies,
 * inline policies, and custom lifecycle hooks from an orchestrator.
 */
export class AwsIamResources extends Construct {
  /** Map of created standalone IamPolicy instances, accessible by their configured names. */
  public readonly createdPolicies: Record<string, IamPolicy> = {};
  /** Map of created IamRole instances, accessible by their configured names. */
  public readonly createdRoles: Record<string, IamRole> = {};

  constructor(
    scope: Construct,
    id: string,
    provider: AwsProvider,
    config: AwsIamResourcesConfig,
  ) {
    super(scope, id);

    // 1. Independent Standalone IAM Policies Creation
    if (config.policies) {
      config.policies.forEach((policyDef, index) => {
        const sanitizedName = policyDef.name.replace(/[^a-zA-Z0-9]/g, "-");

        const policy = new IamPolicy(
          this,
          `iam-policy-${sanitizedName}-${index}`,
          {
            provider: provider,
            name: policyDef.name,
            description: policyDef.description,
            policy: JSON.stringify(policyDef.policy),
            tags: config.tags,
          },
        );

        this.createdPolicies[policyDef.name] = policy;

        // Execute custom hook for policy creation if provided
        if (config.hooks?.onPolicyCreated) {
          config.hooks.onPolicyCreated(policy, policyDef);
        }
      });
    }

    // 2. IAM Roles Creation
    if (config.roles) {
      config.roles.forEach((roleDef, index) => {
        const sanitizedName = roleDef.name.replace(/[^a-zA-Z0-9]/g, "-");

        // 💡 REMOVED: formattedInlinePolicies and direct inlinePolicy argument from IamRole
        // to avoid Terraform's inline_policy deprecation warning.
        const role = new IamRole(this, `iam-role-${sanitizedName}-${index}`, {
          provider: provider,
          name: roleDef.name,
          assumeRolePolicy: JSON.stringify(roleDef.assumeRolePolicy),
          tags: config.tags,
        });

        this.createdRoles[roleDef.name] = role;

        // Execute custom hook for role creation if provided
        if (config.hooks?.onRoleCreated) {
          config.hooks.onRoleCreated(role, roleDef);
        }

        // 💡 NEW: Provision inline policies using the independent IamRolePolicy resource instead
        if (roleDef.inlinePolicies) {
          roleDef.inlinePolicies.forEach((ip, ipIndex) => {
            const sanitizedIpName = ip.name.replace(/[^a-zA-Z0-9]/g, "-");
            new IamRolePolicy(
              this,
              `iam-role-policy-${sanitizedName}-${sanitizedIpName}-${ipIndex}`,
              {
                provider: provider,
                name: ip.name,
                role: role.name,
                policy: JSON.stringify(ip.policy),
              },
            );
          });
        }

        // 3. Attach AWS Managed Policies
        if (roleDef.managedPolicyArns) {
          roleDef.managedPolicyArns.forEach((policyArn, pIndex) => {
            const policyName = policyArn.split("/").pop() || "managed-policy";
            new IamRolePolicyAttachment(
              this,
              `iam-attach-managed-${sanitizedName}-${policyName}-${pIndex}`,
              {
                provider: provider,
                role: role.name,
                policyArn: policyArn,
              },
            );
          });
        }

        // 4. Attach Custom Standalone Policies (defined in step 1)
        if (roleDef.customPolicyNames) {
          roleDef.customPolicyNames.forEach((policyName, pIndex) => {
            const customPolicy = this.createdPolicies[policyName];
            if (!customPolicy) {
              throw new Error(
                `Custom IAM Policy '${policyName}' was not defined in the policies configuration.`,
              );
            }

            new IamRolePolicyAttachment(
              this,
              `iam-attach-custom-${sanitizedName}-${policyName}-${pIndex}`,
              {
                provider: provider,
                role: role.name,
                policyArn: customPolicy.arn,
              },
            );
          });
        }
      });
    }
  }
}
