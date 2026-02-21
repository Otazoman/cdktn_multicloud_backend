import { DnsARecord } from "@cdktn/provider-azurerm/lib/dns-a-record";
import { DnsCnameRecord } from "@cdktn/provider-azurerm/lib/dns-cname-record";
import { DnsTxtRecord } from "@cdktn/provider-azurerm/lib/dns-txt-record";
import { DnsZone } from "@cdktn/provider-azurerm/lib/dns-zone";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Construct } from "constructs";

export function createAzurePublicZones(
  scope: Construct,
  provider: AzurermProvider,
  resourceGroupName: string,
  zones: Array<{
    domain: string;
  }>,
  tags: { [key: string]: string },
): { [domain: string]: DnsZone } {
  const createdZones: { [domain: string]: DnsZone } = {};

  zones.forEach((zoneConfig) => {
    const domainSafeName = zoneConfig.domain.replace(/\./g, "-");

    const zone = new DnsZone(scope, `public-dns-zone-${domainSafeName}`, {
      provider: provider,
      name: zoneConfig.domain,
      resourceGroupName: resourceGroupName,
      tags: {
        ...tags,
        Domain: zoneConfig.domain,
        ZoneType: "Public",
      },
    });
    createdZones[zoneConfig.domain] = zone;
  });

  return createdZones;
}

export function createAzurePublicRecords(
  scope: Construct,
  provider: AzurermProvider,
  resourceGroupName: string,
  zone: DnsZone,
  records: Array<{
    name: string;
    type: "A" | "CNAME" | "TXT";
    values: string[];
    ttl?: number;
  }>,
) {
  return records.map((record, index) => {
    const recordSafeName = `${record.name.replace(/\./g, "-")}-${
      record.type
    }-${index}`;

    const commonProps = {
      provider: provider,
      name: record.name,
      resourceGroupName: resourceGroupName,
      zoneName: zone.name,
      ttl: record.ttl ?? 300,
    };

    switch (record.type) {
      case "A":
        return new DnsARecord(scope, `public-a-${recordSafeName}`, {
          ...commonProps,
          records: record.values,
        });

      case "CNAME":
        return new DnsCnameRecord(scope, `public-cname-${recordSafeName}`, {
          ...commonProps,
          record: record.values[0],
        });

      case "TXT":
        return new DnsTxtRecord(scope, `public-txt-${recordSafeName}`, {
          ...commonProps,
          record: record.values.map((v) => ({
            value: v,
          })),
        });

      default:
        throw new Error(`Unsupported record type: ${record.type}`);
    }
  });
}
