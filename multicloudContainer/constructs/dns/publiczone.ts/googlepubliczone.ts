import { DnsManagedZone } from "@cdktn/provider-google/lib/dns-managed-zone";
import { DnsRecordSet } from "@cdktn/provider-google/lib/dns-record-set";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";

export function createGooglePublicZones(
  scope: Construct,
  provider: GoogleProvider,
  project: string,
  zones: Array<{
    domain: string;
    description?: string;
  }>,
  labels: { [key: string]: string },
): { [domain: string]: DnsManagedZone } {
  const createdZones: { [domain: string]: DnsManagedZone } = {};

  zones.forEach((zoneConfig, idx) => {
    const zoneSafeName = zoneConfig.domain.replace(/\./g, "-");

    const zone = new DnsManagedZone(scope, `public-dns-zone-${idx}`, {
      provider: provider,
      project: project,
      name: `public-zone-${zoneSafeName}`,
      dnsName: zoneConfig.domain.endsWith(".")
        ? zoneConfig.domain
        : zoneConfig.domain + ".",
      visibility: "public",
      description:
        zoneConfig.description || `Public DNS zone for ${zoneConfig.domain}`,
      labels: labels,
    });
    createdZones[zoneConfig.domain] = zone;
  });

  return createdZones;
}

export function createGooglePublicRecords(
  scope: Construct,
  provider: GoogleProvider,
  zone: DnsManagedZone,
  records: Array<{
    name: string;
    type: "A" | "CNAME" | "TXT";
    values: string[];
    ttl?: number;
  }>,
): DnsRecordSet[] {
  return records.map((record, idx) => {
    const recordSafeName = `${record.name.replace(/\./g, "-")}-${
      record.type
    }-${idx}`;

    const processedValues =
      record.type === "TXT"
        ? record.values.map((v) => (v.startsWith('"') ? v : `"${v}"`))
        : record.values.map((v) =>
            record.type === "CNAME" && !v.endsWith(".") ? v + "." : v,
          );

    return new DnsRecordSet(scope, `public-rec-${recordSafeName}`, {
      provider: provider,
      project: zone.project,
      managedZone: zone.name,
      name: record.name.endsWith(".") ? record.name : record.name + ".",
      type: record.type,
      ttl: record.ttl || 300,
      rrdatas: processedValues,
    });
  });
}
