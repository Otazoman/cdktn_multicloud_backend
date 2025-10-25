export const securityGroups = [
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
                cidrBlocks: ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"],
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
                cidrBlocks: ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"],
                description: "MySQL inbound traffic",
            },
            {
                fromPort: 5432,
                toPort: 5432,
                protocol: "tcp",
                cidrBlocks: ["10.0.0.0/16", "10.1.0.0/16", "10.2.0.0/16"],
                description: "PostgreSQL inbound traffic",
            },        ],
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
];