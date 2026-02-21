import { DataGoogleComputeAddresses } from "@cdktn/provider-google/lib/data-google-compute-addresses";
import { DnsManagedZone } from "@cdktn/provider-google/lib/dns-managed-zone";
import { DnsPolicy } from "@cdktn/provider-google/lib/dns-policy";
import { DnsRecordSet } from "@cdktn/provider-google/lib/dns-record-set";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";

/**
 * Retrieves Google Cloud DNS Inbound Resolver IP addresses
 * These are automatically assigned when DNS Policy with inbound forwarding is created
 */
export function getGoogleDnsInboundIps(
  scope: Construct,
  provider: GoogleProvider,
  params: {
    project: string;
    networkName: string;
    region?: string;
    dependsOn?: any[];
  }
): DataGoogleComputeAddresses {
  const filter = `purpose="DNS_RESOLVER"`;
  const dataSource = new DataGoogleComputeAddresses(
    scope,
    "google-dns-resolver-ips",
    {
      provider: provider,
      project: params.project,
      filter: filter,
      region: params.region,
      dependsOn: params.dependsOn,
    }
  );

  return dataSource;
}

export interface GooglePrivateZoneParams {
  project: string;
  networkSelfLink: string; // network selfLink or network id to bind private zone
  zoneNames?: string[]; // e.g. ["privatelink.mysql.database.azure.com"]
  // Optional: For DNS forwarding to Azure DNS
  azureDnsResolverIp?: string; // Azure DNS Private Resolver inbound endpoint IP

  // Optional: For DNS forwarding to AWS Route53 Resolver
  awsInboundEndpointIps?: string[]; // AWS Route53 Resolver inbound endpoint IPs

  // New: Inbound DNS policy configuration
  createInboundPolicy?: boolean;
  inboundPolicyName?: string;

  // New: Cloud SQL instances for A record registration
  cloudSqlInstances?: Array<{
    name: string;
    privateIpAddress: string;
  }>;
}

export function createGooglePrivateDnsZones(
  scope: Construct,
  provider: GoogleProvider,
  params: GooglePrivateZoneParams,
  config: {
    enableForwarding: boolean;
    forwardingDomains: string[];
    labels: { [key: string]: string };
    forwardingZoneNamePrefix?: string;
    forwardingZoneDescription?: string;
    privateZoneNamePrefix?: string;
    privateZoneDescription?: string;
  }
) {
  const zones: { [name: string]: DnsManagedZone } = {};

  const names = params.zoneNames || config.forwardingDomains;

  // If DNS resolver IPs are provided, create forwarding zones
  // Otherwise, create standard private zones
  if (
    config.enableForwarding &&
    (params.azureDnsResolverIp || params.awsInboundEndpointIps?.length)
  ) {
    names.forEach((zoneName, idx) => {
      const zoneSafeName = zoneName.replace(/\./g, "-");
      const namePrefix = config.forwardingZoneNamePrefix || "forward";
      let description = config.forwardingZoneDescription;
      let targetNameServers: Array<{ ipv4Address: string }> = [];

      // Determine target DNS resolver based on domain and available IPs
      if (zoneName === "aws.inner") {
        if (params.awsInboundEndpointIps?.length) {
          // HA VPN case: Forward to AWS Route53 Resolver inbound endpoints
          description =
            description ||
            `Forwarding zone for ${zoneName} to AWS Route53 Resolver`;
          // Use all AWS inbound endpoint IPs for high availability
          params.awsInboundEndpointIps.forEach((awsIp) => {
            // Extract IP from Terraform expression if needed
            const cleanIp = awsIp.includes("${") ? awsIp : awsIp;
            targetNameServers.push({ ipv4Address: cleanIp });
          });
        } else {
          // Single VPN case: Use Google's default DNS for VPN routing
          // Google DNS will resolve through VPN connection using static routes
          description =
            description ||
            `Forwarding zone for ${zoneName} via VPN routing (Single VPN)`;
          // Use Google's public DNS as target for VPN-routed resolution
          targetNameServers.push({ ipv4Address: "8.8.8.8" });
        }
      } else if (
        (zoneName.includes("azure") || zoneName === "azure.inner") &&
        params.azureDnsResolverIp
      ) {
        // For Azure domains, forward to Azure DNS Private Resolver
        description =
          description ||
          `Forwarding zone for ${zoneName} to Azure DNS Private Resolver`;
        targetNameServers.push({ ipv4Address: params.azureDnsResolverIp });
      } else if (params.azureDnsResolverIp) {
        // Default fallback to Azure (for backward compatibility)
        description =
          description ||
          `Forwarding zone for ${zoneName} to Azure DNS Private Resolver`;
        targetNameServers.push({ ipv4Address: params.azureDnsResolverIp });
      }

      // Only create forwarding zone if we have target name servers
      if (targetNameServers.length > 0) {
        const mz = new DnsManagedZone(scope, `gcp-forwarding-zone-${idx}`, {
          provider: provider,
          name: `${namePrefix}-${zoneSafeName}`,
          dnsName: zoneName + ".",
          project: params.project,
          visibility: "private",
          description: description,
          labels: config.labels,
          privateVisibilityConfig: {
            networks: [{ networkUrl: params.networkSelfLink }],
          },
          forwardingConfig: {
            targetNameServers: targetNameServers,
          },
        });
        zones[zoneName] = mz;
      } else {
        console.warn(
          `No target DNS resolver found for zone: ${zoneName}, creating private zone instead`
        );
        // Fall back to creating a private zone
        const mz = new DnsManagedZone(scope, `gcp-private-zone-${idx}`, {
          provider: provider,
          name: `private-${zoneSafeName}`,
          dnsName: zoneName + ".",
          project: params.project,
          visibility: "private",
          description: `Private DNS zone for ${zoneName}`,
          labels: config.labels,
          privateVisibilityConfig: {
            networks: [{ networkUrl: params.networkSelfLink }],
          },
        });
        zones[zoneName] = mz;
      }
    });
  } else {
    // Fallback: Create standard private zones (original behavior)
    names.forEach((zoneName, idx) => {
      const zoneSafeName = zoneName.replace(/\./g, "-");
      const namePrefix = config.privateZoneNamePrefix || "private";
      const description =
        config.privateZoneDescription || `Private DNS zone for ${zoneName}`;

      const mz = new DnsManagedZone(scope, `gcp-private-zone-${idx}`, {
        provider: provider,
        name: `${namePrefix}-${zoneSafeName}`,
        dnsName: zoneName + ".",
        project: params.project,
        visibility: "private",
        description: description,
        labels: config.labels,
        privateVisibilityConfig: {
          networks: [{ networkUrl: params.networkSelfLink }],
        },
      });
      zones[zoneName] = mz;
    });
  }

  return { zones };
}

export function createGoogleCnameRecords(
  scope: Construct,
  provider: GoogleProvider,
  zone: DnsManagedZone,
  records: { name: string; cname: string; ttl?: number }[]
) {
  return records.map(
    (r, idx) =>
      new DnsRecordSet(
        scope,
        `gcp-zone-record-${idx}-${r.name.replace(/\./g, "-")}`,
        {
          provider: provider,
          name: r.name.endsWith(".") ? r.name : r.name + ".",
          managedZone: zone.name,
          type: "CNAME",
          ttl: r.ttl || 300,
          rrdatas: [r.cname.endsWith(".") ? r.cname : r.cname + "."],
        }
      )
  );
}

/**
 * Creates CNAME records for Cloud SQL or other database endpoints
 * to provide short, easy-to-remember names
 */
export function createGoogleDbCnameRecords(
  scope: Construct,
  provider: GoogleProvider,
  params: {
    project: string;
    networkSelfLink: string;
    cnameRecords: Array<{
      shortName: string;
      dbEndpoint: string;
    }>;
  }
) {
  const records: DnsRecordSet[] = [];

  if (!params.cnameRecords || params.cnameRecords.length === 0) {
    return records;
  }

  // Create a private DNS zone for internal DNS names
  const internalZone = new DnsManagedZone(scope, "gcp-db-internal-zone", {
    provider: provider,
    name: "db-internal",
    dnsName: "db.internal.",
    project: params.project,
    visibility: "private",
    description: "Private DNS zone for database short names",
    privateVisibilityConfig: {
      networks: [{ networkUrl: params.networkSelfLink }],
    },
  });

  // Create CNAME records for each database endpoint
  params.cnameRecords.forEach((record, idx) => {
    const cnameRecord = new DnsRecordSet(scope, `gcp-db-cname-${idx}`, {
      provider: provider,
      name: record.shortName.endsWith(".")
        ? record.shortName
        : record.shortName + ".",
      managedZone: internalZone.name,
      type: "CNAME",
      ttl: 300,
      rrdatas: [
        record.dbEndpoint.endsWith(".")
          ? record.dbEndpoint
          : record.dbEndpoint + ".",
      ],
    });
    records.push(cnameRecord);
  });

  return records;
}

/**
 * Creates A records for Cloud SQL instances to provide short, easy-to-remember names
 * This function automatically registers Cloud SQL private IP addresses as A records
 */
export function createGoogleCloudSqlARecords(
  scope: Construct,
  provider: GoogleProvider,
  params: {
    project: string;
    networkSelfLink: string;
    internalZoneName: string;
    zoneDescription: string;
    cloudSqlInstances: Array<{
      name: string;
      privateIpAddress: string;
    }>;
    labels?: { [key: string]: string };
  }
) {
  const records: DnsRecordSet[] = [];

  if (!params.cloudSqlInstances || params.cloudSqlInstances.length === 0) {
    return { internalZone: null, records };
  }

  // Create a private DNS zone for Cloud SQL internal DNS names
  const internalZone = new DnsManagedZone(scope, "gcp-cloudsql-internal-zone", {
    provider: provider,
    name: params.internalZoneName.replace(/\./g, "-"),
    dnsName: params.internalZoneName.endsWith(".")
      ? params.internalZoneName
      : params.internalZoneName + ".",
    project: params.project,
    visibility: "private",
    description: params.zoneDescription,
    labels: params.labels,
    privateVisibilityConfig: {
      networks: [{ networkUrl: params.networkSelfLink }],
    },
  });

  // Create A records for each Cloud SQL instance
  params.cloudSqlInstances.forEach((instance, idx) => {
    const aRecord = new DnsRecordSet(scope, `gcp-cloudsql-a-${idx}`, {
      provider: provider,
      name: instance.name.endsWith(".") ? instance.name : instance.name + ".",
      managedZone: internalZone.name,
      type: "A",
      ttl: 300,
      rrdatas: [instance.privateIpAddress],
    });
    records.push(aRecord);
  });

  return { internalZone, records };
}

/**
 * Enhanced function that creates both inbound DNS capabilities and Cloud SQL A records
 */
export function createGoogleDnsInboundAndCloudSql(
  scope: Construct,
  provider: GoogleProvider,
  params: GooglePrivateZoneParams,
  config: {
    enableForwarding: boolean;
    forwardingDomains: string[];
    labels: { [key: string]: string };
    forwardingZoneNamePrefix?: string;
    forwardingZoneDescription?: string;
    privateZoneNamePrefix?: string;
    privateZoneDescription?: string;
    inboundServerPolicyName?: string;
    cloudSqlARecords?: {
      internalZoneName: string;
      zoneDescription: string;
    };
  }
) {
  const output: any = {};

  // Create standard DNS zones (existing functionality)
  const dnsZones = createGooglePrivateDnsZones(scope, provider, params, config);
  output.zones = dnsZones.zones;

  // Create Cloud SQL A records if instances are provided
  if (params.cloudSqlInstances && config.cloudSqlARecords) {
    const cloudSqlResult = createGoogleCloudSqlARecords(scope, provider, {
      project: params.project,
      networkSelfLink: params.networkSelfLink,
      internalZoneName: config.cloudSqlARecords.internalZoneName,
      zoneDescription: config.cloudSqlARecords.zoneDescription,
      cloudSqlInstances: params.cloudSqlInstances,
      labels: config.labels,
    });
    output.cloudSqlInternalZone = cloudSqlResult.internalZone;
    output.cloudSqlARecords = cloudSqlResult.records;
  }

  // Note: Google Cloud DNS doesn't have explicit "inbound endpoints" like AWS/Azure
  // Instead, inbound queries are handled automatically by private zones
  // The inboundServerPolicyName parameter is kept for consistency but not used

  return output;
}

/**
 * Creates a Google Cloud DNS Inbound Server Policy to allow external networks
 * to query Google Cloud private DNS zones.
 * Returns the policy and related information needed for IP address retrieval
 */
export function createGoogleCloudDnsInboundPolicy(
  scope: Construct,
  provider: GoogleProvider,
  params: {
    project: string;
    networkSelfLink: string;
    policyName?: string;
    labels?: { [key: string]: string };
  }
) {
  const policyName = params.policyName || "gcp-inbound-dns-policy";

  const inboundPolicy = new DnsPolicy(scope, "gcp-inbound-dns-policy", {
    provider: provider,
    project: params.project,
    name: policyName,
    description: "Inbound DNS policy for cross-cloud DNS resolution",
    networks: [
      {
        networkUrl: params.networkSelfLink,
      },
    ],
    enableInboundForwarding: true,
  });

  // Return policy along with parameters needed for IP retrieval
  return {
    policy: inboundPolicy,
    project: params.project,
    networkSelfLink: params.networkSelfLink,
  };
}

/**
 * Creates CNAME records for Cloud SQL instances to provide short, easy-to-remember names.
 * This function maps short names to Cloud SQL connection names (FQDNs).
 */
export function createGoogleCloudSqlCnameRecords(
  scope: Construct,
  provider: GoogleProvider,
  params: {
    project: string;
    networkSelfLink: string;
    internalZone: DnsManagedZone; // The google.inner managed zone
    cloudSqlInstances: Array<{
      name: string; // Short name for the CNAME record
      connectionName: string; // Cloud SQL connection name (e.g., project:region:instance)
    }>;
    labels?: { [key: string]: string };
  }
) {
  const records: DnsRecordSet[] = [];

  if (!params.cloudSqlInstances || params.cloudSqlInstances.length === 0) {
    return records;
  }

  // Create CNAME records for each Cloud SQL instance
  params.cloudSqlInstances.forEach((instance, idx) => {
    const cnameRecord = new DnsRecordSet(scope, `gcp-cloudsql-cname-${idx}`, {
      provider: provider,
      name: instance.name.endsWith(".") ? instance.name : instance.name + ".",
      managedZone: params.internalZone.name,
      type: "CNAME",
      ttl: 300,
      rrdatas: [
        instance.connectionName.endsWith(".")
          ? instance.connectionName
          : instance.connectionName + ".",
      ],
    });
    records.push(cnameRecord);
  });

  return records;
}
