import { DnsManagedZone } from "@cdktf/provider-google/lib/dns-managed-zone";
import { DnsRecordSet } from "@cdktf/provider-google/lib/dns-record-set";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
import { Construct } from "constructs";

export interface GooglePrivateZoneParams {
  project: string;
  networkSelfLink: string; // network selfLink or network id to bind private zone
  zoneNames?: string[]; // e.g. ["privatelink.mysql.database.azure.com"]
  // Optional: For DNS forwarding to Azure DNS
  azureDnsResolverIp?: string; // Azure DNS Private Resolver inbound endpoint IP

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

  // If Azure DNS Resolver IP is provided, create forwarding zones
  // Otherwise, create standard private zones
  if (params.azureDnsResolverIp && config.enableForwarding) {
    names.forEach((zoneName, idx) => {
      const zoneSafeName = zoneName.replace(/\./g, "-");
      const namePrefix = config.forwardingZoneNamePrefix || "forward";
      const description =
        config.forwardingZoneDescription ||
        `Forwarding zone for ${zoneName} to Azure DNS Private Resolver`;

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
          targetNameServers: [
            {
              ipv4Address: params.azureDnsResolverIp,
            },
          ],
        },
      });
      zones[zoneName] = mz;
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
