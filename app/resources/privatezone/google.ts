import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import { awsPrivateZoneParams } from "../../config/aws/privatezone";
import { azurePrivateZoneParams } from "../../config/azure/privatezone";
import { isConnected } from "../../config/connections";
import { LOCATION as GOOGLE_REGION } from "../../config/google/common";
import { googlePrivateZoneParams } from "../../config/google/privatezone";
import {
  addGoogleInnerZoneARecords,
  createGoogleCloudDnsInboundPolicy,
  createGoogleInnerZoneWithARecords,
  createGooglePrivateDnsZones,
  getGoogleDnsInboundIps,
} from "../../constructs/dns/privatezone/googleprivatezone";
import { GoogleVpcResources } from "../../clouds/google/types";

// Google Cloud side of cross-cloud private DNS (inbound policy, forwarding
// zones to AWS / Azure, google.inner zone).

/**
 * Setup Google DNS Inbound Policy and get its IPs
 */
export const setupGoogleInboundPolicy = (
  scope: Construct,
  googleProvider: GoogleProvider,
  googleVpcResources: GoogleVpcResources,
) => {
  console.log("Setting up Google Cloud DNS Inbound Policy");
  const networkSelfLink =
    googleVpcResources.vpc.selfLink ||
    googleVpcResources.vpc.id ||
    googleVpcResources.vpc.name;
  const project = googleProvider.project || "";

  const { policy } = createGoogleCloudDnsInboundPolicy(scope, googleProvider, {
    project,
    networkSelfLink,
    policyName: googlePrivateZoneParams.inboundServerPolicyName,
    labels: googlePrivateZoneParams.labels,
  });

  const networkName = networkSelfLink.split("/").pop() || "";
  // A VPC network has no region; use the configured Google region.
  const vpcRegion = GOOGLE_REGION;

  const dnsIpsDataSource = getGoogleDnsInboundIps(scope, googleProvider, {
    project,
    networkName,
    region: vpcRegion,
    dependsOn: [policy],
  });

  return { policy, ips: dnsIpsDataSource.addresses };
};

/**
 * Setup Google DNS Forwarding Zones (requires VPN)
 * Creates forwarding zones to AWS/Azure DNS resolvers.
 */
export const setupGoogleForwardingZones = (
  scope: Construct,
  googleProvider: GoogleProvider,
  googleVpcResources: GoogleVpcResources,
  awsInboundEndpointIps: string[],
  azureDnsResolverIps: string[],
) => {
  const networkSelfLink =
    googleVpcResources.vpc.selfLink ||
    googleVpcResources.vpc.id ||
    googleVpcResources.vpc.name;
  const project = googleProvider.project || "";

  let targetDnsResolverIp: string | undefined = undefined;
  if (isConnected("google", "azure") && azureDnsResolverIps.length > 0) {
    targetDnsResolverIp = azureDnsResolverIps[0];
  } else if (isConnected("aws", "google") && awsInboundEndpointIps.length > 0) {
    targetDnsResolverIp = awsInboundEndpointIps[0];
  }
  const enableForwarding = !!targetDnsResolverIp;

  let filteredForwardingDomains: string[] = [];
  if (isConnected("google", "azure")) {
    filteredForwardingDomains.push(
      ...googlePrivateZoneParams.forwardingDomains.filter(
        (d) =>
          d.includes("azure") ||
          d === azurePrivateZoneParams.azureInnerDomain.zoneName,
      ),
    );
  }
  if (isConnected("aws", "google")) {
    filteredForwardingDomains.push(
      ...googlePrivateZoneParams.forwardingDomains.filter(
        (d) => d === awsPrivateZoneParams.rdsInternalZone.zoneName,
      ),
    );
  }

  return createGooglePrivateDnsZones(
    scope,
    googleProvider,
    {
      project,
      networkSelfLink,
      zoneNames: enableForwarding
        ? filteredForwardingDomains
        : googlePrivateZoneParams.forwardingDomains,
      azureDnsResolverIp: targetDnsResolverIp,
      awsInboundEndpointIps: isConnected("aws", "google")
        ? awsInboundEndpointIps
        : undefined,
    },
    {
      enableForwarding,
      forwardingDomains:
        filteredForwardingDomains.length > 0
          ? filteredForwardingDomains
          : googlePrivateZoneParams.forwardingDomains,
      labels: {
        ...googlePrivateZoneParams.labels,
        ...(isConnected("aws", "google") && {
          "aws-dns-forwarding": "enabled",
        }),
        ...(isConnected("google", "azure") && {
          "azure-dns-forwarding": "enabled",
        }),
      },
      forwardingZoneNames: googlePrivateZoneParams.forwardingZoneNames,
      forwardingZoneDescription: enableForwarding
        ? `Forwarding zone to ${
            isConnected("aws", "google") ? "AWS Route53 and " : ""
          }${
            isConnected("google", "azure") ? "Azure DNS" : ""
          } Resolver`
        : googlePrivateZoneParams.forwardingZoneDescription,
      privateZoneNames: googlePrivateZoneParams.privateZoneNames,
      privateZoneDescription: googlePrivateZoneParams.privateZoneDescription,
    },
  );
};

/**
 * Setup Google Inner Zone (google.inner) with A records for CloudSQL and Filestore.
 * This does NOT require VPN — it runs whenever GCP services need internal DNS.
 */
export const setupGoogleInnerZone = (
  scope: Construct,
  googleProvider: GoogleProvider,
  googleVpcResources: GoogleVpcResources,
  googleCloudSqlInstances?: any[],
  googleFilestoreInstances?: Array<{
    aRecordName: string;
    privateIpAddress: string;
  }>,
) => {
  const networkSelfLink =
    googleVpcResources.vpc.selfLink ||
    googleVpcResources.vpc.id ||
    googleVpcResources.vpc.name;
  const project = googleProvider.project || "";

  const innerOutput: any = {};

  // google.inner zone shared by Cloud SQL and Filestore.
  // The zone is created once by whichever service is processed first,
  // and subsequent services reuse the existing zone via addGoogleInnerZoneARecords.
  let googleInnerZone: any = null;

  // Cloud SQL A records (creates google.inner zone)
  if (googleCloudSqlInstances && googleCloudSqlInstances.length > 0) {
    const cloudSqlResult = createGoogleInnerZoneWithARecords(
      scope,
      googleProvider,
      {
        project,
        networkSelfLink,
        internalZoneName:
          googlePrivateZoneParams.cloudSqlARecords.internalZoneName,
        zoneResourceName:
          googlePrivateZoneParams.cloudSqlARecords.zoneResourceName,
        zoneDescription:
          googlePrivateZoneParams.cloudSqlARecords.zoneDescription,
        instances: googleCloudSqlInstances.map((i) => ({
          name: i.aRecordName,
          privateIpAddress: i.privateIpAddress,
        })),
        recordIdPrefix: "gcp-cloudsql-a-record",
        labels: googlePrivateZoneParams.labels,
      },
    );
    googleInnerZone = cloudSqlResult.internalZone;
    innerOutput.googleInnerZone = cloudSqlResult.internalZone;
    innerOutput.cloudSqlARecords = cloudSqlResult.records;
  }

  // Filestore A records:
  // - If google.inner zone already exists (Cloud SQL created it), reuse it.
  // - If Storage only (no Cloud SQL), create the zone here.
  if (googleFilestoreInstances && googleFilestoreInstances.length > 0) {
    if (googleInnerZone) {
      // Zone already exists — add records only (avoids Construct name collision)
      innerOutput.filestoreARecords = addGoogleInnerZoneARecords(
        scope,
        googleProvider,
        googleInnerZone,
        googleFilestoreInstances.map((i) => ({
          name: i.aRecordName,
          privateIpAddress: i.privateIpAddress,
        })),
        "gcp-filestore-a-record",
      );
    } else {
      // Storage only — create google.inner zone here
      const filestoreResult = createGoogleInnerZoneWithARecords(
        scope,
        googleProvider,
        {
          project,
          networkSelfLink,
          internalZoneName:
            googlePrivateZoneParams.filestoreARecords.internalZoneName,
          zoneResourceName:
            googlePrivateZoneParams.filestoreARecords.zoneResourceName,
          zoneDescription:
            googlePrivateZoneParams.filestoreARecords.zoneDescription,
          instances: googleFilestoreInstances.map((i) => ({
            name: i.aRecordName,
            privateIpAddress: i.privateIpAddress,
          })),
          recordIdPrefix: "gcp-filestore-a-record",
          labels: googlePrivateZoneParams.labels,
        },
      );
      googleInnerZone = filestoreResult.internalZone;
      innerOutput.googleInnerZone = filestoreResult.internalZone;
      innerOutput.filestoreARecords = filestoreResult.records;
    }
  }

  return innerOutput;
};
