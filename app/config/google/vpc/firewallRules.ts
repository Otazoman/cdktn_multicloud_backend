// ingress Rule
export const firewallIngressRules = [
  {
    name: "google-ssh-allow-rule",
    resourceName: "multicloud-gcp-vpc-google-ssh-allow-rule",
    permission: {
      protocol: "tcp",
      ports: ["22"],
    },
    sourceRanges: ["35.235.240.0/20"],
    priority: 1000,
  },
  {
    name: "internal-aws-rule",
    resourceName: "multicloud-gcp-vpc-internal-aws-rule",
    permission: {
      protocol: "all",
    },
    sourceRanges: ["10.0.0.0/16"],
    priority: 1000,
  },
  {
    name: "internal-google-rule",
    resourceName: "multicloud-gcp-vpc-internal-google-rule",
    permission: {
      protocol: "all",
    },
    sourceRanges: ["10.1.0.0/16"],
    priority: 1000,
  },
  {
    name: "internal-azure-rule",
    resourceName: "multicloud-gcp-vpc-internal-azure-rule",
    permission: {
      protocol: "all",
    },
    sourceRanges: ["10.2.0.0/16"],
    priority: 1000,
  },
  {
    name: "allow-cloudsql-mysql",
    resourceName: "multicloud-gcp-vpc-allow-cloudsql-mysql",
    permission: {
      protocol: "tcp",
      ports: ["3306"],
    },
    sourceRanges: ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"],
    priority: 1000,
  },
  {
    name: "allow-cloudsql-postgres",
    resourceName: "multicloud-gcp-vpc-allow-cloudsql-postgres",
    permission: {
      protocol: "tcp",
      ports: ["5432"],
    },
    sourceRanges: ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"],
    priority: 1000,
  },
  {
    name: "allow-filestore-nfs",
    resourceName: "multicloud-gcp-vpc-allow-filestore-nfs",
    permission: {
      protocol: "tcp",
      ports: ["2049", "111", "20048"],
    },
    sourceRanges: ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"],
    priority: 1000,
  },
];

// Egress Rule
export const firewallEgressRules = [
  {
    name: "vpn-all-outbound-rule",
    resourceName: "multicloud-gcp-vpc-vpn-all-outbound-rule",
    permission: {
      protocol: "all",
    },
    sourceRanges: ["0.0.0.0/0"],
    destinationRanges: ["0.0.0.0/0"],
    priority: 1000,
  },
  {
    name: "cloudsql-response-to-rule",
    resourceName: "multicloud-gcp-vpc-cloudsql-response-to-rule",
    permission: {
      protocol: "all",
    },
    sourceRanges: ["0.0.0.0/0"],
    destinationRanges: ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"],
    priority: 1000,
  },
];
