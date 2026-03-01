// ingress Rule
export const firewallIngressRules = [
  {
    name: "google-ssh-allow-rule",
    permission: {
      protocol: "tcp",
      ports: ["22"],
    },
    sourceRanges: ["35.235.240.0/20"],
    priority: 1000,
  },
  {
    name: "internal-aws-rule",
    permission: {
      protocol: "all",
    },
    sourceRanges: ["10.0.0.0/16"],
    priority: 1000,
  },
  {
    name: "internal-google-rule",
    permission: {
      protocol: "all",
    },
    sourceRanges: ["10.1.0.0/16"],
    priority: 1000,
  },
  {
    name: "internal-azure-rule",
    permission: {
      protocol: "all",
    },
    sourceRanges: ["10.2.0.0/16"],
    priority: 1000,
  },
  {
    name: "allow-cloudsql-mysql",
    permission: {
      protocol: "tcp",
      ports: ["3306"],
    },
    sourceRanges: ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"],
    priority: 1000,
  },
  {
    name: "allow-cloudsql-postgres",
    permission: {
      protocol: "tcp",
      ports: ["5432"],
    },
    sourceRanges: ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"],
    priority: 1000,
  },
  {
    name: "allow-filestore-nfs",
    permission: {
      protocol: "tcp",
      ports: ["2049", "111", "20048"],
    },
    sourceRanges: ["10.1.0.0/16"],
    priority: 1000,
  },
];

// Egress Rule
export const firewallEgressRules = [
  {
    name: "vpn-all-outbound-rule",
    permission: {
      protocol: "all",
    },
    sourceRanges: ["0.0.0.0/0"],
    destinationRanges: ["0.0.0.0/0"],
    priority: 1000,
  },
  {
    name: "cloudsql-response-to-rule",
    permission: {
      protocol: "all",
    },
    sourceRanges: ["0.0.0.0/0"],
    destinationRanges: ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"],
    priority: 1000,
  },
];
