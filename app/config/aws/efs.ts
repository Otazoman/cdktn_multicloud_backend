/* EFS configurations */
export const efsConfigs = [
  // Not used by the API: build it when the application needs shared files
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
    // DNS CNAME record name registered in aws.inner private zone
    cnameRecordName: "efs-shared.aws.inner",
    accessPoints: [
      {
        name: "app-access-point",
        resourceName: "SharedDataStorage-app-access-point",
        path: "/",
        creationInfo: { ownerGid: 1000, ownerUid: 1000, permissions: "755" },
        posixUser: { gid: 1000, uid: 1000 },
      },
    ],
  },

];
