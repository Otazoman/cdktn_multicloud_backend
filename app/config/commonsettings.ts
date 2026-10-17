// ---------------------------------------------------------------------------
// Global switches. Read these values through config/connections.ts and
// config/features.ts instead of importing them directly.
// ---------------------------------------------------------------------------

import { byEnv } from "./environment";

export type CloudId = "aws" | "google" | "azure";

// ---- Accounts per environment (FEAT-04) ------------------------------------

/**
 * Accounts of the current environment (DEPLOY_ENV). When set, the providers
 * refuse to run against another account, so that the credentials of one
 * environment cannot change another. The Google Cloud project is
 * PROJECT_NAME in config/google/common.ts.
 */
export interface EnvAccounts {
  /** AWS account ID (12 digits) */
  awsAccountId?: string;
  /** Azure subscription ID */
  azureSubscriptionId?: string;
}

export const accounts: EnvAccounts = byEnv<EnvAccounts>({
  default: {},
  // stg: { awsAccountId: "123456789012", azureSubscriptionId: "..." },
});

// ---- Cross-cloud VPN -------------------------------------------------------

/**
 * "singleTunnel": one tunnel per connection, static routes (Classic VPN on
 * Google Cloud). "haBgp": HA VPN with two tunnels per connection and BGP.
 */
export type VpnMode = "singleTunnel" | "haBgp";

export const vpnMode: VpnMode = byEnv<VpnMode>({
  dev: "singleTunnel",
  stg: "singleTunnel",
  prod: "haBgp",
});

// ---- Cross-cloud VPN -------------------------------------------------------

/** Create VPN resources at all */
export const useVpn: boolean = false;

// Direct VPN connection per cloud pair. When two pairs share a cloud
// (e.g. awsToAzure + googleToAzure), that cloud acts as a hub and routes
// between the other two via BGP (vpnMode "haBgp" only).
export const awsToGoogle: boolean = true;
export const awsToAzure: boolean = true;
export const googleToAzure: boolean = true;

// ---- Cross-cloud private DNS -----------------------------------------------

/** Private DNS zones and cross-cloud DNS forwarding */
export const hostZones: boolean = false;

// ---- Per-cloud switches ----------------------------------------------------
// Each feature is created when the cloud and the feature are enabled. VPN
// connections do not affect these switches.

export interface CloudFeatures {
  /** VMs */
  vms: boolean;
  /** Managed relational databases */
  dbs: boolean;
  /** File storage */
  storage: boolean;
  /** Managed containers and their load balancers */
  containers: boolean;
  /** CI/CD */
  cicd: boolean;
  /** Public DNS zones and records */
  dns: boolean;
  /** Notification targets and alarms / alert policies */
  alerting: boolean;
  /** Archive container logs to object storage (S3 / GCS / Azure Storage) */
  logArchive: boolean;
}

export interface CloudSettings {
  /** Create the cloud's network and everything that depends on it */
  enabled: boolean;
  features: CloudFeatures;
}

export const clouds: Record<CloudId, CloudSettings> = {
  aws: {
    enabled: true,
    features: {
      vms: true,
      dbs: true,
      storage: false,
      containers: true,
      cicd: true,
      dns: false,
      alerting: false,
      logArchive: false,
    },
  },
  google: {
    enabled: true,
    features: {
      vms: true,
      dbs: true,
      storage: false,
      containers: true,
      cicd: true,
      dns: false,
      alerting: false,
      logArchive: false,
    },
  },
  azure: {
    enabled: true,
    features: {
      vms: true,
      dbs: true,
      storage: false,
      containers: true,
      cicd: true,
      dns: false,
      alerting: true,
      logArchive: false,
    },
  },
};
