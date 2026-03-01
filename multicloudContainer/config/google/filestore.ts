import { LOCATION, PROJECT_NAME } from "./common";

/* Filestore configurations */
export const filestoreConfigs = [
  {
    build: false,
    name: "gcp-shared-filestore001",
    project: PROJECT_NAME,
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
    connectMode: "DIRECT_PEERING" as
      | "DIRECT_PEERING"
      | "PRIVATE_SERVICE_ACCESS",
    labels: {
      env: "development",
      team: "team-a",
    },
  },
  {
    build: false,
    name: "gcp-shared-filestore002",
    project: PROJECT_NAME,
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
    connectMode: "DIRECT_PEERING" as
      | "DIRECT_PEERING"
      | "PRIVATE_SERVICE_ACCESS",
    labels: {
      env: "development",
      team: "team-b",
    },
  },
];
