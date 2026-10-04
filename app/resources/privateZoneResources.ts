import { CloudContext } from "../clouds/types";
import { useVpn } from "../config/commonsettings";
import { isCloudConnected } from "../config/connections";
import { VpnResources } from "./vpn/types";
import { setupAwsResources } from "./privatezone/aws";
import {
  setupAzureForwardingAndInner,
  setupAzureResolver,
} from "./privatezone/azure";
import {
  setupGoogleForwardingZones,
  setupGoogleInboundPolicy,
  setupGoogleInnerZone,
} from "./privatezone/google";

export interface PrivateZoneResources {
  aws?: any;
  google?: any;
  azure?: any;
}

// ---------------------------------------------------------------------------
// Cross-cloud private DNS entry point. Each cloud's side lives in
// privatezone/<cloud>.ts; this function only orders the steps (some steps
// need IPs collected by earlier ones).
// ---------------------------------------------------------------------------

export const createPrivateZoneResources = (
  ctx: CloudContext,
  // VPN resources, for the Azure Private DNS Resolver dependency on the
  // GatewaySubnet
  vpnResources?: VpnResources,
): PrivateZoneResources => {
  const { scope, providers, outputs } = ctx;
  const awsProvider = providers.aws;
  const googleProvider = providers.google;
  const azureProvider = providers.azure;
  // VPC resources
  const awsVpcResources = outputs.aws.vpc;
  const googleVpcResources = outputs.google.vpc;
  const azureVnetResources = outputs.azure.vpc;
  // DB / Storage / Container metadata for CNAME / A-record registration
  const awsDbResources = outputs.aws.dbResources;
  const googleCloudSqlInstances = outputs.google.cloudSqlInstances;
  const googleFilestoreInstances = outputs.google.filestoreInstances;
  const azureDatabaseResources = outputs.azure.dbResources;
  const awsEfsInstances = outputs.aws.efsInstances;
  const azureFilesInstances = outputs.azure.filesInstances;
  const azureAcaInstances = outputs.azure.acaInstances;
  const output: PrivateZoneResources = {};

  // Step 1: Azure Resolver (Initial IP collection)
  let azureDnsResolverIps: string[] = [];
  let azureResolverTemp: any;
  if (
    azureProvider &&
    azureVnetResources &&
    isCloudConnected("azure") &&
    useVpn
  ) {
    const { resolver, ip } = setupAzureResolver(
      scope,
      azureProvider,
      azureVnetResources,
      vpnResources,
    );
    azureResolverTemp = resolver;
    if (ip) azureDnsResolverIps = [ip];
  }

  // Step 2: Google Inbound Policy (Initial IP collection)
  let googleInboundPolicy: any;
  let googleInboundIps: any = [];
  if (
    googleProvider &&
    googleVpcResources &&
    isCloudConnected("google") &&
    useVpn
  ) {
    const { policy, ips } = setupGoogleInboundPolicy(
      scope,
      googleProvider,
      googleVpcResources,
    );
    googleInboundPolicy = policy;
    googleInboundIps = ips;
  }

  // Step 3: AWS Resources
  let awsInboundEndpointIps: string[] = [];
  if (awsProvider && awsVpcResources) {
    const { awsOutput, awsInboundEndpointIps: ips } = setupAwsResources(
      scope,
      awsProvider,
      awsVpcResources,
      azureDnsResolverIps,
      googleInboundIps,
      awsDbResources,
      awsEfsInstances,
    );
    output.aws = awsOutput;
    awsInboundEndpointIps = ips;
  }

  // Step 4a: Google DNS Forwarding Zones
  if (
    googleProvider &&
    googleVpcResources &&
    isCloudConnected("google") &&
    useVpn
  ) {
    const forwardingZones = setupGoogleForwardingZones(
      scope,
      googleProvider,
      googleVpcResources,
      awsInboundEndpointIps,
      azureDnsResolverIps,
    );
    output.google = {
      ...output.google,
      ...forwardingZones,
      inboundPolicy: googleInboundPolicy,
    };
  }

  // Step 4b: Google Inner Zone (google.inner)
  if (
    googleProvider &&
    googleVpcResources &&
    (googleCloudSqlInstances?.length || googleFilestoreInstances?.length)
  ) {
    const innerZoneOutput = setupGoogleInnerZone(
      scope,
      googleProvider,
      googleVpcResources,
      googleCloudSqlInstances,
      googleFilestoreInstances,
    );
    output.google = {
      ...output.google,
      ...innerZoneOutput,
    };
  }

  // Step 5 & 6: Azure Forwarding & Inner Zone
  if (azureProvider && azureVnetResources && azureResolverTemp) {
    output.azure = setupAzureForwardingAndInner(
      scope,
      azureProvider,
      azureVnetResources,
      azureResolverTemp,
      awsInboundEndpointIps,
      googleInboundIps,
      azureDatabaseResources,
      azureFilesInstances,
      azureAcaInstances,
    );
  } else if (
    azureProvider &&
    azureVnetResources &&
    (azureDatabaseResources?.length || azureFilesInstances?.length)
  ) {
    // Case where only inner zone is needed but no resolver
    output.azure = setupAzureForwardingAndInner(
      scope,
      azureProvider,
      azureVnetResources,
      undefined,
      [],
      [],
      azureDatabaseResources,
      azureFilesInstances,
      azureAcaInstances,
    );
  }

  return output;
};
