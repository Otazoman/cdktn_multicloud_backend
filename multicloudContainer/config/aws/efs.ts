/* EFS configurations */
export const efsConfigs = [
  // 1. Existing High-Performance EFS
  {
    build: false,
    name: "aws-app-shared-storage",
    encrypted: true,
    performanceMode: "generalPurpose" as "generalPurpose" | "maxIO",
    throughputMode: "bursting" as "bursting" | "provisioned" | "elastic",
    subnetKeys: ["my-aws-vpc-private-subnet1a", "my-aws-vpc-private-subnet1c"],
    securityGroupIds: ["myaws-efs-sg"],
    tags: {
      Name: "SharedDataStorage",
      Owner: "Team-A",
    },
    transitionToIa: "AFTER_7_DAYS",
    backupPolicy: "ENABLED",
    accessPoints: [
      {
        name: "app-access-point",
        path: "/",
        creationInfo: { ownerGid: 1000, ownerUid: 1000, permissions: "755" },
        posixUser: { gid: 1000, uid: 1000 },
      },
    ],
  },

  // 2. Cost-Optimized EFS (Newly Added)
  {
    build: false,
    name: "aws-backup-storage",
    encrypted: true,
    performanceMode: "generalPurpose" as "generalPurpose" | "maxIO", // Best for most use cases
    throughputMode: "elastic" as "bursting" | "provisioned" | "elastic", // Pay-as-you-go throughput
    subnetKeys: ["my-aws-vpc-private-subnet1a"], // Single subnet for lower mount target costs (optional)
    securityGroupIds: ["myaws-efs-sg"],
    tags: {
      Name: "CostOptimizedStorage",
      Owner: "Team-B",
    },
    transitionToIa: "AFTER_7_DAYS", // Rapidly transition to Infrequent Access (IA) to save up to 90%
    backupPolicy: "DISABLED", // Disable backup if data is non-critical to save cost
    accessPoints: [], // Empty if not needed
  },
];
