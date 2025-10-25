
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
];

// Egress Rule
export const firewallEgressRules = [
    {
        name: "vpn-rule",
        permission: {
            protocol: "all",
        },
        sourceRanges: ["0.0.0.0/0"],
        destinationRanges: ["0.0.0.0/0"],
        priority: 1000,
    },
];