import { LOCATION, PROJECT_NAME } from "./common";

/** Filestore instance configurations */
export const filestoreConfigs = {
  project: PROJECT_NAME,
  instances: [
    {
      // Not used by the API: build it when the application needs shared files
      build: false,
      name: "gcp-shared-filestore001",
      location: LOCATION + "-a",
      tier: "BASIC_HDD" as
        | "BASIC_HDD"
        | "BASIC_SSD"
        | "HIGH_SCALE_SSD"
        | "ENTERPRISE"
        | "ZONAL"
        | "REGIONAL",
      fileShare: {
        name: "vol1",
        capacityGb: 1024,
      },
      networkName: "multicloud-gcp-vpc",
      // Use PRIVATE_SERVICE_ACCESS so Filestore joins the shared PSA peering
      connectMode: "PRIVATE_SERVICE_ACCESS" as
        | "DIRECT_PEERING"
        | "PRIVATE_SERVICE_ACCESS",
      // Reference the named ComputeGlobalAddress created by GooglePrivateServiceAccess.
      // Must match googlePsaConfig.serviceRanges.filestore.rangeName in psa.ts.
      // A single /24 range supports multiple BASIC_HDD instances (each uses /29 internally).
      reservedIpRange: "gcp-psa-filestore-range",
      // DNS A record name registered in google.inner private zone
      aRecordName: "filestore001.google.inner",
      labels: {
        env: "development",
        team: "team-a",
      },
    },
  ],
};
