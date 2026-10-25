export const googlePrivateZoneParams = {
  enableForwarding: true,
  forwardingDomains: [
    // Parent domain for Azure Database for PostgreSQL Flexible Server
    "postgres.database.azure.com",
    // Private Link domains for Azure Private Endpoints
    "privatelink.postgres.database.azure.com",
    // Private Link domain for Azure Files (NFS mount from GCP/AWS)
    "privatelink.file.core.windows.net",
    // for CNAME
    "azure.inner",
    // AWS domains
    "aws.inner", // AWS internal domain for RDS short names
  ],
  labels: {
    purpose: "azure-dns-forwarding",
    environment: "multicloud",
    managed_by: "cdktf",
  },

  // Optional: Custom names and descriptions for DNS zones
  // Zone name per forwarding domain: forwarding zone (when the peer DNS is
  // reachable) / private zone (otherwise).
  // Omitted: <project>-google-forwarding-zone-<domain> / -private-zone-<domain>
  forwardingZoneNames: {
    "postgres.database.azure.com": "forward-postgres-database-azure-com",
    "privatelink.postgres.database.azure.com": "forward-privatelink-postgres-database-azure-com",
    "privatelink.file.core.windows.net": "forward-privatelink-file-core-windows-net",
    "azure.inner": "forward-azure-inner",
    "aws.inner": "forward-aws-inner",
  } as Record<string, string>,
  forwardingZoneDescription: "Forwarding zone to Azure DNS Private Resolver",
  privateZoneNames: {
    "postgres.database.azure.com": "private-postgres-database-azure-com",
    "privatelink.postgres.database.azure.com": "private-privatelink-postgres-database-azure-com",
    "privatelink.file.core.windows.net": "private-privatelink-file-core-windows-net",
    "azure.inner": "private-azure-inner",
    "aws.inner": "private-aws-inner",
  } as Record<string, string>,
  privateZoneDescription: "Private DNS zone for AWS or Azure services",

  // Service Networking peered DNS domains: Cloud SQL (in Google's service
  // producer network) does not see this VPC's private zones. With these, it
  // resolves the forwarded domains through this VPC, so its subscriptions
  // reach the other databases by their private DNS names. Created for the
  // connected forwarding domains when a Private Service Access connection
  // exists (dbs or storage). Value: peering name.
  // Google's documentation lists Cloud SQL as not supported; tested working
  // for PostgreSQL logical replication (2026-10-25)
  peeredDnsDomainNames: {
    "aws.inner": "aws-inner",
    "azure.inner": "azure-inner",
  } as Record<string, string>,

  // Inbound server policy (DNS queries from AWS / Azure into Google Cloud)
  inboundServerPolicyName: "gcp-resolver-inbound",

  // Cloud SQL A record configuration
  cloudSqlARecords: {
    internalZoneName: "google.inner",
    // Zone resource name (shared with filestoreARecords)
    zoneResourceName: "google-inner",
    zoneDescription: "Private DNS zone for Cloud SQL short names",
  },
  // Filestore A record configuration (shares the same google.inner zone as Cloud SQL)
  filestoreARecords: {
    internalZoneName: "google.inner",
    zoneResourceName: "google-inner",
    zoneDescription: "Private DNS zone for Filestore short names",
  },
};
