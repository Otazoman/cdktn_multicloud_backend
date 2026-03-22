/**
 * Shared Private Service Access (PSA) configuration for Google Cloud.
 *
 * A single VPC peering connection (ServiceNetworkingConnection) is created.
 * Multiple IP ranges can be registered to it, but they must be non-overlapping.
 *
 * IP range layout (example):
 *   10.100.10.0/24 - CloudSQL dedicated range
 *   10.100.1.0/29  - Filestore instance 001
 *   10.100.1.8/29  - Filestore instance 002
 *
 * Each service supports multiple ranges as an array, so additional ranges
 * can be added without modifying existing ones.
 *
 * NOTE: All ranges registered in reservedPeeringRanges must be non-overlapping.
 */
export const googlePsaConfig = {
  /** Construct ID used for getOrCreate singleton pattern */
  psaConstructId: "google-psa",

  /**
   * Set to true to reference existing ComputeGlobalAddress resources via DataSource
   * instead of creating new ones.
   */
  isExisting: false,

  // --- Per-service IP ranges (arrays; all entries must be non-overlapping) ---
  serviceRanges: {
    /**
     * IP ranges for Cloud SQL instances.
     * GCP automatically assigns IPs within these ranges to Cloud SQL.
     * Add more entries to this array if additional ranges are needed.
     */
    cloudSql: [
      {
        rangeName: "gcp-psa-cloudsql-range",
        address: "10.100.10.0",
        prefixLength: 24,
      },
    ],
    /**
     * IP ranges for Filestore instances.
     * Each BASIC_HDD/SSD instance requires a /29 block.
     * Add one entry per instance (or use a larger block like /24 shared across instances).
     * rangeName must match the reservedIpRange in filestore.ts for each instance.
     */
    filestore: [
      {
        rangeName: "gcp-psa-filestore-range",
        address: "10.100.1.0",
        prefixLength: 29,
      },
      {
        rangeName: "gcp-psa-filestore002-range",
        address: "10.100.1.8",
        prefixLength: 29,
      },
    ],
  },
};
