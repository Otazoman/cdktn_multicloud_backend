export const securityGroups = [
  {
    resourcetype: "other",
    name: "route53-resolver-sg",
    tags: {
      Purpose: "Route53ResolverEndpoint",
    },
    ingress: [
      {
        fromPort: 53,
        toPort: 53,
        protocol: "tcp",
        cidrBlocks: ["10.0.0.0/16"],
        description: "Allow DNS TCP from VPC",
      },
      {
        fromPort: 53,
        toPort: 53,
        protocol: "udp",
        cidrBlocks: ["10.0.0.0/16"],
        description: "Allow DNS UDP from VPC",
      },
      {
        fromPort: 53,
        toPort: 53,
        protocol: "tcp",
        cidrBlocks: ["35.199.192.0/19"],
        description: "Allow DNS TCP from Google",
      },
      {
        fromPort: 53,
        toPort: 53,
        protocol: "udp",
        cidrBlocks: ["35.199.192.0/19"],
        description: "Allow DNS UDP from Google",
      },
      {
        fromPort: 53,
        toPort: 53,
        protocol: "tcp",
        cidrBlocks: ["10.2.0.0/16"],
        description: "Allow DNS TCP from Azure",
      },
      {
        fromPort: 53,
        toPort: 53,
        protocol: "udp",
        cidrBlocks: ["10.2.0.0/16"],
        description: "Allow DNS UDP from Azure",
      },
    ],
    egress: [
      {
        fromPort: 53,
        toPort: 53,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
        description: "Allow DNS TCP",
      },
      {
        fromPort: 53,
        toPort: 53,
        protocol: "udp",
        cidrBlocks: ["0.0.0.0/0"],
        description: "Allow DNS UDP",
      },
    ],
  },
  {
    resourcetype: "ec2",
    name: "myaws-ec2-sg",
    tags: {
      Purpose: "General",
    },
    ingress: [
      {
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: [
          "10.0.0.0/16",
          "10.1.0.0/16",
          "10.2.0.0/16",
          "10.100.0.0/16",
        ],
        description: "Allow all inbound traffic",
      },
    ],
    egress: [
      {
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
        ipv6CidrBlocks: ["::/0"],
        description: "Allow all outbound traffic",
      },
    ],
  },
  {
    resourcetype: "rds",
    name: "myaws-db-sg",
    tags: {
      Purpose: "DB",
    },
    ingress: [
      {
        fromPort: 3306,
        toPort: 3306,
        protocol: "tcp",
        cidrBlocks: [
          "10.0.0.0/16",
          "10.1.0.0/16",
          "10.2.0.0/16",
          "10.100.0.0/16",
        ],
        description: "MySQL inbound traffic",
      },
      {
        fromPort: 5432,
        toPort: 5432,
        protocol: "tcp",
        cidrBlocks: [
          "10.0.0.0/16",
          "10.1.0.0/16",
          "10.2.0.0/16",
          "10.100.0.0/16",
        ],
        description: "PostgreSQL inbound traffic",
      },
    ],
    egress: [
      {
        fromPort: 80,
        toPort: 80,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
        ipv6CidrBlocks: ["::/0"],
        description: "Allow http outbound traffic",
      },
      {
        fromPort: 443,
        toPort: 443,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
        ipv6CidrBlocks: ["::/0"],
        description: "Allow https outbound traffic",
      },
    ],
  },
  {
    resourcetype: "other",
    name: "EC2InstanceConnect",
    tags: {
      Purpose: "EC2Connect",
    },
    ingress: [],
    egress: [
      {
        fromPort: 22,
        toPort: 22,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
        ipv6CidrBlocks: ["::/0"],
        description: "EC2 Instance Connect",
      },
    ],
  },
  {
    resourcetype: "alb",
    name: "alb-sg",
    tags: {
      Purpose: "ALB",
    },
    ingress: [
      {
        fromPort: 80,
        toPort: 80,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
        description: "Allow HTTP inbound traffic",
      },
      {
        fromPort: 443,
        toPort: 443,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
        description: "Allow HTTPS inbound traffic",
      },
    ],
    egress: [
      {
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
        ipv6CidrBlocks: ["::/0"],
        description: "Allow all outbound traffic to backends",
      },
    ],
  },
  {
    resourcetype: "other",
    name: "myaws-efs-sg",
    tags: {
      Purpose: "SharedStorage",
    },
    ingress: [
      {
        fromPort: 2049,
        toPort: 2049,
        protocol: "tcp",
        cidrBlocks: ["10.0.0.0/16"],
        description: "Allow NFS traffic for EFS",
      },
    ],
    egress: [
      {
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
        description: "Allow all outbound traffic",
      },
    ],
  },
];
