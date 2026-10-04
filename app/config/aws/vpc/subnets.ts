export const subnets = [
    {
        cidrBlock: "10.0.11.0/24",
        az: "ap-northeast-1a",
        name: "my-aws-vpc-public-subnet1a",
        type: "public",
        tags: {
            Tier: "Web",
        },
    },
    {
        cidrBlock: "10.0.12.0/24",
        az: "ap-northeast-1c",
        name: "my-aws-vpc-public-subnet1c",
        type: "public",
        tags: {
            Tier: "Web",
        },
    },
    {
        cidrBlock: "10.0.13.0/24",
        az: "ap-northeast-1d",
        name: "my-aws-vpc-public-subnet1d",
        type: "public",
        tags: {
            Tier: "Web",
        },
    },
    {
        cidrBlock: "10.0.21.0/24",
        az: "ap-northeast-1a",
        name: "my-aws-vpc-private-subnet1a",
        type: "private",
        tags: {
            Tier: "App",
        },
    },
    {
        cidrBlock: "10.0.22.0/24",
        az: "ap-northeast-1c",
        name: "my-aws-vpc-private-subnet1c",
        type: "private",
        tags: {
            Tier: "App",
        },
    },
    {
        cidrBlock: "10.0.23.0/24",
        az: "ap-northeast-1d",
        name: "my-aws-vpc-private-subnet1d",
        type: "private",
        tags: {
            Tier: "App",
        },
    },
    {
        cidrBlock: "10.0.31.0/24",
        az: "ap-northeast-1a",
        name: "my-aws-vpc-db-private-subnet1a",
        type: "private",
        tags: {
            Tier: "DB",
        },
    },
    {
        cidrBlock: "10.0.32.0/24",
        az: "ap-northeast-1c",
        name: "my-aws-vpc-db-private-subnet1c",
        type: "private",
        tags: {
            Tier: "DB",
        },
    },
    {
        cidrBlock: "10.0.33.0/24",
        az: "ap-northeast-1d",
        name: "my-aws-vpc-db-private-subnet1d",
        type: "private",
        tags: {
            Tier: "DB",
        },
    },
];