// ---------------------------------------------------------------------------
// Deployment environments (FEAT-04)
//
// Each environment is deployed to its own cloud accounts. The environment is
// selected with the DEPLOY_ENV environment variable, which compose.yaml sets
// for the container together with the credentials in .env.<env>.
//
// Config files write values that differ per environment with byEnv():
//
//   instanceType: byEnv({ dev: "t3.micro", stg: "t3.small", prod: "t3.medium" })
//   instanceType: byEnv({ default: "t3.micro", prod: "t3.medium" })
//
// To add an environment, add its name to ENVIRONMENTS, create .env.<env> and
// set a value in every byEnv() without `default` (the compiler lists them).
// ---------------------------------------------------------------------------

export const ENVIRONMENTS = ["dev", "stg", "prod"] as const;

export type EnvName = (typeof ENVIRONMENTS)[number];

/** Returns DEPLOY_ENV. Throws when it is missing or unknown. */
export function currentEnv(): EnvName {
  const value = process.env.DEPLOY_ENV;
  if (!value) {
    throw new Error(
      `DEPLOY_ENV is not set. Use one of: ${ENVIRONMENTS.join(", ")} ` +
        "(see docs/getting-started.md).",
    );
  }
  if (!(ENVIRONMENTS as readonly string[]).includes(value)) {
    throw new Error(
      `Unknown DEPLOY_ENV "${value}". Use one of: ${ENVIRONMENTS.join(", ")}.`,
    );
  }
  return value as EnvName;
}

/** Values per environment: every environment, or `default` plus overrides. */
export type ByEnv<T> =
  | Record<EnvName, T>
  | ({ default: T } & Partial<Record<EnvName, T>>);

/** Returns the value of the current environment (DEPLOY_ENV). */
export function byEnv<T>(values: ByEnv<T>): T {
  const env = currentEnv();
  if (env in values) {
    return (values as Partial<Record<EnvName, T>>)[env] as T;
  }
  return (values as { default: T }).default;
}

/**
 * Name that must be unique across environments (globally unique names such
 * as Key Vault, ACR or storage accounts). dev keeps `base`; other
 * environments append the environment name ("-stg", or "stg" when hyphens
 * are not allowed). Use byEnv() instead to choose the names freely.
 */
export function envScopedName(
  base: string,
  options: { hyphen?: boolean } = {},
): string {
  const env = currentEnv();
  if (env === "dev") {
    return base;
  }
  return options.hyphen === false ? `${base}${env}` : `${base}-${env}`;
}
