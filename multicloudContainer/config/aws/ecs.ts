export const awsEcsConfigs = [
  {
    name: "api-service",
    build: true,
    clusterName: "main-cluster",
    cpu: "256",
    memory: "512",
    desiredCount: 2,
    containerName: "api-container",
    image: "nginx:latest",
    port: 80,
    securityGroupNames: ["alb-sg"],
    subnetNames: [
      "my-aws-vpc-private-subnet1a",
      "my-aws-vpc-private-subnet1c",
      "my-aws-vpc-private-subnet1d",
    ],
    targetGroupName: "managed-api-tg",
  },
];
