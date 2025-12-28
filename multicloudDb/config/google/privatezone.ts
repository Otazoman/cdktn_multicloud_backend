export const googlePrivateZoneParams = {
  enableForwarding: true,
  forwardingDomains: [
    // Parent domains for Azure Database for MySQL/PostgreSQL Flexible Server
    "mysql.database.azure.com",
    "postgres.database.azure.com",
    // Private Link domains for Azure Private Endpoints
    "privatelink.mysql.database.azure.com",
    "privatelink.postgres.database.azure.com",
  ],
  labels: {
    purpose: "azure-dns-forwarding",
    environment: "multicloud",
    managed_by: "cdktf",
  },

  // Optional: Custom names and descriptions for DNS zones
  forwardingZoneNamePrefix: "forward",
  forwardingZoneDescription: "Forwarding zone to Azure DNS Private Resolver",
  privateZoneNamePrefix: "private",
  privateZoneDescription: "Private DNS zone for Azure services",

  // Inbound/Outbound endpoint configurations
  inboundServerPolicyName: "gcp-resolver-inbound",
  outboundForwardingZonePrefix: "gcp-resolver-outbound",

  // Cloud SQL A record configuration
  cloudSqlARecords: {
    internalZoneName: "cloudsql.internal",
    zoneDescription: "Private DNS zone for Cloud SQL short names",
  },
};
