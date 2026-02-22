import { Route53Zone } from "@cdktn/provider-aws/lib/route53-zone";
import { Route53Record } from "@cdktn/provider-aws/lib/route53-record";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { DnsZone } from "@cdktn/provider-azurerm/lib/dns-zone";
import { DnsARecord } from "@cdktn/provider-azurerm/lib/dns-a-record";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { DnsManagedZone } from "@cdktn/provider-google/lib/dns-managed-zone";
import { DnsRecordSet } from "@cdktn/provider-google/lib/dns-record-set";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import { TerraformOutput } from "cdktn";
import { albConfigs } from "../config/aws/awssettings";
import { azureAppGwConfigs } from "../config/azure/applicationgateway";
import { gcpLbConfigs } from "../config/google/googlesettings";
import { LbResourcesOutputWithDns, CreatedPublicZones } from "./interfaces";

/**
 * Step 1: Create Public DNS Zones
 * Automatically extracts subdomains from LB config files
 */
export function createPublicDnsZones(
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider?: GoogleProvider,
  azureProvider?: AzurermProvider,
  tags: { [key: string]: string } = {},
): CreatedPublicZones {
  const awsZones: Record<string, Route53Zone> = {};
  const googleZones: Record<string, DnsManagedZone> = {};
  const azureZones: Record<string, DnsZone> = {};

  // Extract unique subdomains from config files
  const unique = (arr: (string | undefined)[]) =>
    Array.from(new Set(arr.filter(Boolean))) as string[];

  const awsSubdomains = unique(
    albConfigs?.filter((c) => c.build).map((c) => c.dnsConfig?.subdomain),
  );
  const googleSubdomains = unique(
    gcpLbConfigs?.filter((c) => c.build).map((c) => c.dnsConfig?.subdomain),
  );
  const azureSubdomains = unique(
    azureAppGwConfigs
      ?.filter((c) => c.build)
      .map((c) => c.dnsConfig?.subdomain),
  );

  // AWS
  awsSubdomains.forEach((subdomain) => {
    const zoneSafeName = subdomain.replace(/\./g, "-");
    awsZones[subdomain] = new Route53Zone(scope, `p-zone-aws-${zoneSafeName}`, {
      provider: awsProvider,
      name: subdomain,
      tags: { ...tags, Name: subdomain },
    });
    new TerraformOutput(scope, `aws-ns-${zoneSafeName}`, {
      value: awsZones[subdomain].nameServers,
    });
  });

  // Google
  if (googleProvider && googleSubdomains.length > 0) {
    googleSubdomains.forEach((subdomain) => {
      const zoneSafeName = subdomain.replace(/\./g, "-");
      googleZones[subdomain] = new DnsManagedZone(
        scope,
        `p-zone-gcp-${zoneSafeName}`,
        {
          provider: googleProvider,
          project: gcpLbConfigs[0].project,
          name: `zone-${zoneSafeName}`,
          dnsName: subdomain.endsWith(".") ? subdomain : `${subdomain}.`,
          visibility: "public",
        },
      );
      new TerraformOutput(scope, `gcp-ns-${zoneSafeName}`, {
        value: googleZones[subdomain].nameServers,
      });
    });
  }

  // Azure
  if (azureProvider && azureSubdomains.length > 0) {
    azureSubdomains.forEach((subdomain) => {
      const zoneSafeName = subdomain.replace(/\./g, "-");
      azureZones[subdomain] = new DnsZone(
        scope,
        `p-zone-azure-${zoneSafeName}`,
        {
          provider: azureProvider,
          name: subdomain,
          resourceGroupName: azureAppGwConfigs[0].resourceGroupName,
        },
      );
      new TerraformOutput(scope, `azure-ns-${zoneSafeName}`, {
        value: azureZones[subdomain].nameServers,
      });
    });
  }

  return { awsZones, googleZones, azureZones };
}

/**
 * Step 2: Create A Records
 */
export function createPublicDnsRecords(
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider | undefined,
  azureProvider: AzurermProvider | undefined,
  zones: CreatedPublicZones,
  lbResources: LbResourcesOutputWithDns,
) {
  // AWS Records
  lbResources.awsAlbs?.forEach((alb, index) => {
    const zone = zones.awsZones[alb.dnsInfo.subdomain];
    if (zone) {
      new Route53Record(scope, `aws-a-rec-${index}`, {
        provider: awsProvider,
        zoneId: zone.zoneId,
        name: alb.dnsInfo.fqdn || alb.dnsInfo.subdomain,
        type: "A",
        alias: {
          name: alb.alb.dnsName,
          zoneId: alb.alb.zoneId,
          evaluateTargetHealth: true,
        },
      });
    }
  });

  // Google Records
  if (googleProvider) {
    lbResources.googleLbs?.forEach((lbGroup) => {
      [...(lbGroup.global || []), ...(lbGroup.regional || [])].forEach(
        (lb, index) => {
          if (!lb.dnsInfo) return;
          const zone = zones.googleZones[lb.dnsInfo.subdomain];
          const ipAddress = lb.staticIp?.address || lb.forwardingRule.ipAddress;
          if (zone && ipAddress) {
            new DnsRecordSet(scope, `gcp-a-rec-${index}`, {
              provider: googleProvider,
              project: zone.project,
              managedZone: zone.name,
              name: lb.dnsInfo.fqdn
                ? lb.dnsInfo.fqdn.endsWith(".")
                  ? lb.dnsInfo.fqdn
                  : `${lb.dnsInfo.fqdn}.`
                : zone.dnsName,
              type: "A",
              ttl: 300,
              rrdatas: [ipAddress],
            });
          }
        },
      );
    });
  }

  // Azure Records
  if (azureProvider) {
    lbResources.azureAppGws?.forEach((appGw, index) => {
      const zone = zones.azureZones[appGw.dnsInfo.subdomain];
      if (zone) {
        new DnsARecord(scope, `azure-a-rec-${index}`, {
          provider: azureProvider,
          name: appGw.dnsInfo.fqdn || appGw.dnsInfo.subdomain,
          resourceGroupName: zone.resourceGroupName,
          zoneName: zone.name,
          ttl: 300,
          records: [appGw.publicIp.ipAddress],
        });
      }
    });
  }
}
