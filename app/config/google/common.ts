import { byEnv } from "../environment";

/**
 * Google Cloud project ID of the current environment (DEPLOY_ENV). Required
 * when Google Cloud is enabled in that environment.
 */
export const PROJECT_NAME: string = byEnv({
  dev: "multicloud-sitevpn-project",
  stg: "", // set the project ID of stg
  prod: "", // set the project ID of prod
});
export const LOCATION = "asia-northeast1";

/**
 * Public DNS domain of this cloud in the current environment (DEPLOY_ENV).
 * The load balancer host names, certificates and public DNS zones are built
 * from it. Used only when the features that need it are enabled (public DNS:
 * features.dns; AWS-managed certificates). Set another value per
 * environment with byEnv, e.g. { dev: "...", stg: "...", prod: "..." }.
 */
export const PUBLIC_DOMAIN: string = byEnv({
  default: "googletest.tohonokai.com",
});
