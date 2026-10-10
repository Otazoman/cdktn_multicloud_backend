// ---------------------------------------------------------------------------
// Global switches. Read these values through config/connections.ts and
// config/features.ts instead of importing them directly.
// ---------------------------------------------------------------------------

export type CloudId = "aws" | "google" | "azure";

/** "dev": single-tunnel VPN (static routes) / "prod": HA VPN (BGP) */
export const env: string = "prod";

// ---- Cross-cloud VPN -------------------------------------------------------

/** Create VPN resources at all */
export const useVpn: boolean = true;

// Direct VPN connection per cloud pair. When two pairs share a cloud
// (e.g. awsToAzure + googleToAzure), that cloud acts as a hub and routes
// between the other two via BGP (prod only).
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
      dbs: false,
      storage: false,
      containers: false,
      cicd: false,
      dns: false,
      alerting: false,
      logArchive: false,
    },
  },
  google: {
    enabled: true,
    features: {
      vms: true,
      dbs: false,
      storage: false,
      containers: false,
      cicd: false,
      dns: false,
      alerting: false,
      logArchive: false,
    },
  },
  azure: {
    enabled: true,
    features: {
      vms: true,
      dbs: false,
      storage: false,
      containers: false,
      cicd: false,
      dns: false,
      alerting: true,
      logArchive: false,
    },
  },
};
