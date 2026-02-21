import { DataAwsRoute53Zone } from "@cdktn/provider-aws/lib/data-aws-route53-zone";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Route53Record } from "@cdktn/provider-aws/lib/route53-record";
import { DataAzurermDnsZone } from "@cdktn/provider-azurerm/lib/data-azurerm-dns-zone";
import { DnsARecord } from "@cdktn/provider-azurerm/lib/dns-a-record";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { DataGoogleDnsManagedZone } from "@cdktn/provider-google/lib/data-google-dns-managed-zone";
import { DnsRecordSet } from "@cdktn/provider-google/lib/dns-record-set";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import { azureAppGwConfigs } from "../config/azure/applicationgateway";
import { gcpLbConfigs } from "../config/google/googlesettings";
import {
  AwsAlbResourcesWithDns,
  AzureAppGwResourcesWithDns,
  LbResourcesOutputWithDns,
  PublicDnsZoneResources,
} from "./interfaces";

/**
 * Creates A records in existing public DNS zones for load balancers
 * Note: Public DNS zones must be created manually in advance
 * This function only references existing zones and creates A records
 */
export function createPublicDnsZonesAndRecords(
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider?: GoogleProvider,
  azureProvider?: AzurermProvider,
  lbResources?: LbResourcesOutputWithDns,
): PublicDnsZoneResources {
  const result: PublicDnsZoneResources = {};

  if (!lbResources) {
    return result;
  }

  // --- AWS Route53 A Records ---
  if (lbResources.awsAlbs && lbResources.awsAlbs.length > 0) {
    // Group ALBs by subdomain
    const albsBySubdomain = new Map<string, AwsAlbResourcesWithDns[]>();
    lbResources.awsAlbs.forEach((alb) => {
      const subdomain = alb.dnsInfo.subdomain;
      if (!albsBySubdomain.has(subdomain)) {
        albsBySubdomain.set(subdomain, []);
      }
      albsBySubdomain.get(subdomain)!.push(alb);
    });

    // Reference existing zones and create A records
    albsBySubdomain.forEach((albs, subdomain) => {
      // Reference existing public zone
      const existingZone = new DataAwsRoute53Zone(
        scope,
        `data-zone-${subdomain.replace(/\./g, "-")}`,
        {
          provider: awsProvider,
          name: subdomain,
        },
      );

      // Create A records for each ALB
      albs.forEach((alb, index) => {
        const recordName = alb.dnsInfo.fqdn || subdomain;

        // AWS ALB A record (pointing to ALB DNS name)
        new Route53Record(
          scope,
          `a-record-${subdomain.replace(/\./g, "-")}-${index}`,
          {
            provider: awsProvider,
            zoneId: existingZone.zoneId,
            name: recordName,
            type: "A",
            alias: {
              name: alb.alb.dnsName,
              zoneId: alb.alb.zoneId,
              evaluateTargetHealth: true,
            },
          },
        );
      });
    });
  }

  // --- Google Cloud DNS A Records ---
  if (
    googleProvider &&
    lbResources.googleLbs &&
    lbResources.googleLbs.length > 0 &&
    gcpLbConfigs.length > 0
  ) {
    const googleProject = gcpLbConfigs[0].project;

    // Collect all subdomains from Google LBs
    const subdomains = new Set<string>();
    lbResources.googleLbs.forEach((lbGroup) => {
      if (lbGroup.global) {
        lbGroup.global.forEach((lb) => {
          if (lb.dnsInfo) subdomains.add(lb.dnsInfo.subdomain);
        });
      }
      if (lbGroup.regional) {
        lbGroup.regional.forEach((lb) => {
          if (lb.dnsInfo) subdomains.add(lb.dnsInfo.subdomain);
        });
      }
    });

    // Reference existing zones and create A records
    if (subdomains.size > 0) {
      const existingZones: Record<string, DataGoogleDnsManagedZone> = {};

      subdomains.forEach((subdomain) => {
        const zoneName = subdomain.replace(/\./g, "-");
        existingZones[subdomain] = new DataGoogleDnsManagedZone(
          scope,
          `data-google-zone-${zoneName}`,
          {
            provider: googleProvider,
            name: zoneName,
            project: googleProject,
          },
        );
      });

      // Create A records for each LB
      let recordIndex = 0;
      lbResources.googleLbs.forEach((lbGroup) => {
        const processLb = (lb: any) => {
          if (!lb.dnsInfo) return;

          const zone = existingZones[lb.dnsInfo.subdomain];
          if (!zone) return;

          const recordName = lb.dnsInfo.fqdn || lb.dnsInfo.subdomain;
          const ipAddress = lb.staticIp?.address || lb.forwardingRule.ipAddress;

          if (ipAddress) {
            new DnsRecordSet(scope, `google-a-record-${recordIndex++}`, {
              provider: googleProvider,
              project: googleProject,
              name: recordName.endsWith(".") ? recordName : `${recordName}.`,
              type: "A",
              ttl: 300,
              managedZone: zone.name,
              rrdatas: [ipAddress],
            });
          }
        };

        if (lbGroup.global) {
          lbGroup.global.forEach(processLb);
        }
        if (lbGroup.regional) {
          lbGroup.regional.forEach(processLb);
        }
      });
    }
  }

  // --- Azure DNS A Records ---
  if (
    azureProvider &&
    lbResources.azureAppGws &&
    lbResources.azureAppGws.length > 0 &&
    azureAppGwConfigs.length > 0
  ) {
    const azureResourceGroup = azureAppGwConfigs[0].resourceGroupName;

    // Group App Gateways by subdomain
    const appGwsBySubdomain = new Map<string, AzureAppGwResourcesWithDns[]>();
    lbResources.azureAppGws.forEach((appGw) => {
      const subdomain = appGw.dnsInfo.subdomain;
      if (!appGwsBySubdomain.has(subdomain)) {
        appGwsBySubdomain.set(subdomain, []);
      }
      appGwsBySubdomain.get(subdomain)!.push(appGw);
    });

    // Reference existing zones and create A records
    appGwsBySubdomain.forEach((appGws, subdomain) => {
      // Reference existing public zone
      const existingZone = new DataAzurermDnsZone(
        scope,
        `data-azure-zone-${subdomain.replace(/\./g, "-")}`,
        {
          provider: azureProvider,
          name: subdomain,
          resourceGroupName: azureResourceGroup,
        },
      );

      // Create A records for each App Gateway
      appGws.forEach((appGw, index) => {
        const recordName = appGw.dnsInfo.fqdn || subdomain;
        const ipAddress = appGw.publicIp.ipAddress;

        new DnsARecord(
          scope,
          `azure-a-record-${subdomain.replace(/\./g, "-")}-${index}`,
          {
            provider: azureProvider,
            name: recordName,
            resourceGroupName: azureResourceGroup,
            zoneName: existingZone.name,
            ttl: 300,
            records: [ipAddress],
          },
        );
      });
    });
  }

  return result;
}
