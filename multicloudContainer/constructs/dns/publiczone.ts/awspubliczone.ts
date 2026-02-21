import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Route53Record } from "@cdktn/provider-aws/lib/route53-record";
import { Route53Zone } from "@cdktn/provider-aws/lib/route53-zone";
import { Construct } from "constructs";

export function createAwsPublicZones(
  scope: Construct,
  provider: AwsProvider,
  zones: Array<{
    domain: string;
    comment?: string;
  }>,
  tags: { [key: string]: string },
): { [domain: string]: Route53Zone } {
  const createdZones: { [domain: string]: Route53Zone } = {};

  zones.forEach((zoneConfig) => {
    const domainSafeName = zoneConfig.domain.replace(/\./g, "-");

    const zone = new Route53Zone(scope, `public-zone-${domainSafeName}`, {
      provider: provider,
      name: zoneConfig.domain,
      comment: zoneConfig.comment,
      tags: {
        ...tags,
        Domain: zoneConfig.domain,
        Type: "Public",
      },
    });
    createdZones[zoneConfig.domain] = zone;
  });

  return createdZones;
}

export function createAwsPublicRecords(
  scope: Construct,
  provider: AwsProvider,
  zone: Route53Zone,
  records: Array<{
    name: string;
    type: "A" | "CNAME" | "TXT";
    values: string[];
    ttl?: number;
  }>,
): Route53Record[] {
  return records.map((record) => {
    const recordSafeName = record.name.replace(/\./g, "-");

    return new Route53Record(
      scope,
      `public-rec-${recordSafeName}-${record.type}`,
      {
        provider: provider,
        zoneId: zone.zoneId,
        name: record.name,
        type: record.type,
        ttl: record.ttl ?? 300,
        records: record.values,
      },
    );
  });
}
