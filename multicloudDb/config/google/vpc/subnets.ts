export const subnets = [
  {
    name: "web-subnet",
    cidr: "10.1.10.0/24",
    region: "asia-northeast1",
    labels: {
      Tier: "Web",
    },
  },
  {
    name: "app-subnet",
    cidr: "10.1.20.0/24",
    region: "asia-northeast1",
    labels: {
      Tier: "App",
    },
  },
];
