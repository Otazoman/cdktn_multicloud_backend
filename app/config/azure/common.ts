import { byEnv } from "../environment";

export const RESOURCE_GROUP = "rg_multicloud";
export const LOCATION = "Japan East";
export const VNET_NAME = "my-azure-vnet";

/**
 * Public DNS domain of this cloud in the current environment (DEPLOY_ENV).
 * The load balancer host names, certificates and public DNS zones are built
 * from it. Used only when the features that need it are enabled (public DNS:
 * features.dns; AWS-managed certificates). Set another value per
 * environment with byEnv, e.g. { dev: "...", stg: "...", prod: "..." }.
 */
export const PUBLIC_DOMAIN: string = byEnv({
  default: "azuretest.tohonokai.com",
});

export const azureCommonparams = {
  resourceGroup: RESOURCE_GROUP,
  location: LOCATION,
  tags: {
    project: "multicloud-vpn",
  },
};
