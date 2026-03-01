/* EFS configurations */
export const efsConfigs = [
  {
    build: true,
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
    // Note: Ensure your createAwsEfs function is updated to handle these if used
    transitionToIa: "AFTER_30_DAYS",
    backupPolicy: "ENABLED",

    // Access Point configurations
    accessPoints: [
      {
        name: "app-access-point",
        path: "/", // Flattened based on our interface
        creationInfo: {
          ownerGid: 1000,
          ownerUid: 1000,
          permissions: "755",
        },
        posixUser: { gid: 1000, uid: 1000 },
      },
    ],
  },
];
