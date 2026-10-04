import { LOCATION } from "../common";

export const subnets = [
  {
    name: "web-subnet",
    resourceName: "multicloud-gcp-vpc-web-subnet",
    cidr: "10.1.10.0/24",
    region: LOCATION,
    labels: {
      Tier: "Web",
    },
  },
  {
    name: "app-subnet",
    resourceName: "multicloud-gcp-vpc-app-subnet",
    cidr: "10.1.20.0/24",
    region: LOCATION,
    labels: {
      Tier: "App",
    },
  },
  {
    name: "other-subnet",
    resourceName: "multicloud-gcp-vpc-other-subnet",
    cidr: "10.1.31.0/24",
    region: LOCATION,
    labels: {
      Tier: "other",
    },
  },
];
