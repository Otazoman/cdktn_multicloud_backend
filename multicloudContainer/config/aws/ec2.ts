/* EC2 instance configurations */
export const ec2Configs = [
  {
    build: true,
    ami: "ami-0b20f552f63953f0e",
    instanceType: "t3.micro",
    keyName: "multicloud_test",
    tags: {
      Name: "MyEC2Instance1",
      Owner: "Team-A",
    },
    subnetKey: "my-aws-vpc-private-subnet1a",
    securityGroupIds: ["myaws-ec2-sg"],
    diskSize: 8,
    userDataScriptPath: "./scripts/vm_init.sh",
  },
  {
    build: false,
    ami: "ami-0b20f552f63953f0e",
    instanceType: "t3.small",
    keyName: "multicloud_test",
    tags: {
      Name: "MyEC2Instance2",
      Owner: "Team-B",
    },
    subnetKey: "my-aws-vpc-private-subnet1c",
    securityGroupIds: ["myaws-ec2-sg"],
    diskSize: 8,
  },
];
