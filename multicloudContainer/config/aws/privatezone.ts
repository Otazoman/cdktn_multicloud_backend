export const awsPrivateZoneParams = {
  enableConditionalForwarding: true,
  resolverSubnetIds: [], // Will be populated at runtime from VPC resources
  resolverSecurityGroupIds: [], // Will be populated at runtime from VPC resources
  resolverSecurityGroupName: "route53-resolver-sg", // Security group name for Route53 Resolver
  forwardingDomains: [
    // Parent domains for Azure Database for MySQL/PostgreSQL Flexible Server
    "mysql.database.azure.com",
    "postgres.database.azure.com",
    // Private Link domains for Azure Private Endpoints
    "privatelink.mysql.database.azure.com",
    "privatelink.postgres.database.azure.com",
    // for CNAME
    "azure.inner",
    // Google Cloud domains
    "google.inner", // Google internal domain for CloudSQL short names
  ],

  // Optional: Custom names and descriptions for Route53 resources
  outboundEndpointName: "aws-resolver-outbound",
  resolverRuleNamePrefix: "forward",
  inboundEndpointName: "aws-resolver-inbound",

  // Optional: Custom comments for private zones (when not forwarding)
  privateZoneComments: {
    "mysql.database.azure.com": "Private zone for Azure MySQL Flexible Server",
    "postgres.database.azure.com":
      "Private zone for Azure PostgreSQL Flexible Server",
    "privatelink.mysql.database.azure.com":
      "Private zone for Azure MySQL Private Link",
    "privatelink.postgres.database.azure.com":
      "Private zone for Azure PostgreSQL Private Link",
  },

  // RDS short name configuration
  rdsInternalZone: {
    zoneName: "aws.inner",
    comment: "Private hosted zone for RDS short names",
    tags: {
      Purpose: "RDS-ShortNames",
      Environment: "MultiCloud",
      ManagedBy: "CDKTF",
    },
  },

  // Tags for Route53 Resolver and forwarding rules
  tags: {
    Purpose: "Azure-DNS-Forwarding",
    Environment: "MultiCloud",
    ManagedBy: "CDKTF",
  },

  // RDS CNAME records using DB identifiers (endpoints will be resolved at runtime)
  // These identifiers match the ones defined in aurorards.ts
  rdsCnameRecords: [
    {
      shortName: "rds-mysql",
      dbIdentifier: "rds-mysql-instance", // RDS MySQL identifier from aurorards.ts
      type: "rds", // rds or aurora
    },
    {
      shortName: "rds-postgres",
      dbIdentifier: "rds-postgres-instance", // RDS PostgreSQL identifier from aurorards.ts
      type: "rds",
    },
    {
      shortName: "aurora-mysql",
      dbIdentifier: "aurora-mysql-cluster", // Aurora MySQL cluster identifier from aurorards.ts
      type: "aurora",
    },
    {
      shortName: "aurora-postgres",
      dbIdentifier: "aurora-postgres-cluster", // Aurora PostgreSQL cluster identifier from aurorards.ts
      type: "aurora",
    },
  ],
};
