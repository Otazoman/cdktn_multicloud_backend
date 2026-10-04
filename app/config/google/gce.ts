import { LOCATION, PROJECT_NAME } from "./common";

/* GCE instance configurations */
const serviceAccountScopes = [
  "https://www.googleapis.com/auth/devstorage.read_only",
  "https://www.googleapis.com/auth/logging.write",
  "https://www.googleapis.com/auth/monitoring.write",
  "https://www.googleapis.com/auth/servicecontrol",
  "https://www.googleapis.com/auth/service.management.readonly",
  "https://www.googleapis.com/auth/trace.append",
];

export const gceInstancesParams = {
  project: PROJECT_NAME,
  instanceConfigs: [
    {
      build: true,
      name: "gce-instance-1",
      machineType: "e2-micro",
      zone: LOCATION + "-a",
      tags: ["multicloud"],
      labels: {
        name: "example-instance1",
        owner: "team-a",
      },
      bootDiskImage:
        "projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20240701a",
      bootDiskSize: 10,
      bootDiskType: "pd-standard",
      bootDiskDeviceName: "test-instance1-boot-disk",
      subnetworkName: "app-subnet",
      serviceAccountScopes: serviceAccountScopes,
      startupScriptPath: "./scripts/vm_init.sh",
    },
    {
      build: false,
      name: "gce-instance-2",
      machineType: "e2-micro",
      zone: LOCATION + "-b",
      tags: ["multicloud"],
      labels: {
        name: "example-instance2",
        owner: "team-a",
      },
      bootDiskImage:
        "projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20240701a",
      bootDiskSize: 20,
      bootDiskType: "pd-standard",
      bootDiskDeviceName: "test-instance2-boot-disk",
      subnetworkName: "app-subnet",
      serviceAccountScopes: serviceAccountScopes,
    },
  ],
};
