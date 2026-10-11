import { byEnv } from "../environment";

export const REGION = "ap-northeast-1";

/**
 * Public DNS domain of this cloud in the current environment (DEPLOY_ENV).
 * The load balancer host names, certificates and public DNS zones are built
 * from it. Used only when the features that need it are enabled (public DNS:
 * features.dns; AWS-managed certificates). Set another value per
 * environment with byEnv, e.g. { dev: "...", stg: "...", prod: "..." }.
 */
export const PUBLIC_DOMAIN: string = byEnv({
  default: "awstest.tohonokai.com",
});
