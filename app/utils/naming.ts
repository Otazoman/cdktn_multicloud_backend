import { CloudId } from "../config/commonsettings";
import { PROJECT_NAME } from "../config/naming";

/** Naming constraints of a resource type. */
export interface NameRule {
  /** Maximum length (default: 63) */
  maxLength?: number;
  /** Whether "-" is allowed (default: true). If not, separators are removed */
  allowHyphen?: boolean;
}

/** Common rules. Add entries here when a resource type needs its own rule. */
export const NAME_RULES = {
  /** Default: lowercase letters, digits and hyphens, up to 63 characters */
  standard: {},
  /** AWS ALB / target group names */
  awsLoadBalancer: { maxLength: 32 },
  /** Azure storage account names */
  azureStorageAccount: { maxLength: 24, allowHyphen: false },
  /** Azure Container Registry names */
  azureContainerRegistry: { maxLength: 50, allowHyphen: false },
} satisfies Record<string, NameRule>;

/**
 * Returns the default name `<PROJECT_NAME>-<cloud>-<type>[-<key>]`, adjusted
 * to `rule` (lowercase; characters other than letters, digits and hyphens are
 * replaced with hyphens; truncated to the maximum length).
 */
export function defaultResourceName(
  cloud: CloudId,
  type: string,
  key?: string,
  rule: NameRule = NAME_RULES.standard,
): string {
  const maxLength = rule.maxLength ?? 63;
  const allowHyphen = rule.allowHyphen ?? true;

  let name = [PROJECT_NAME, cloud, type, key]
    .filter((part): part is string => Boolean(part))
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-");
  if (!allowHyphen) {
    name = name.replace(/-/g, "");
  }
  return name.slice(0, maxLength).replace(/-+$/, "");
}

/**
 * Returns `name` when it is set in the config file, otherwise the default
 * name (see `defaultResourceName`).
 */
export function resourceName(
  name: string | undefined,
  cloud: CloudId,
  type: string,
  key?: string,
  rule?: NameRule,
): string {
  return name ?? defaultResourceName(cloud, type, key, rule);
}
