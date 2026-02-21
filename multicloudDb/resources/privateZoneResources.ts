import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Route53Zone } from "@cdktn/provider-aws/lib/route53-zone";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { TerraformIterator, Token } from "cdktf";
import { Construct } from "constructs";
import { awsPrivateZoneParams } from "../config/aws/privatezone";
import { azurePrivateZoneParams } from "../config/azure/privatezone";
import {
  awsToAzure,
  awsToGoogle,
  googleToAzure,
} from "../config/commonsettings";
import { googlePrivateZoneParams } from "../config/google/privatezone";
import {
  createAwsCnameRecords,
  createAwsInboundEndpoint,
  createAwsOutboundEndpointWithRules,
  createAwsPrivateZones,
  ForwardingRule,
} from "../constructs/privatezone/awsprivatezone";
import {
  createAzureForwardingRuleset,
  createAzureInnerCnameRecords,
  createAzureInnerPrivateDnsZone,
  createAzurePrivateResolver,
} from "../constructs/privatezone/azureprivatezone";
import {
  createGoogleCloudDnsInboundPolicy,
  createGoogleCloudSqlARecords,
  createGooglePrivateDnsZones,
  getGoogleDnsInboundIps,
} from "../constructs/privatezone/googleprivatezone";
import {
  AwsDbResources,
  AwsVpcResources,
  AzureVnetResources,
  GoogleVpcResources,
} from "./interfaces";

export interface PrivateZoneResources {
  aws?: any;
  google?: any;
  azure?: any;
}

/**
 * Helper to get subnet IDs for AWS Route53 Resolver
 */
const getAwsResolverSubnetIds = (
  awsVpcResources: AwsVpcResources,
): string[] => {
  let subnetIds: string[] = [];
  if (
    awsVpcResources.subnetsByName &&
    Object.keys(awsVpcResources.subnetsByName).length > 0
  ) {
    subnetIds = Object.values(awsVpcResources.subnetsByName)
      .map((s: any) => s.id)
      .filter(Boolean);
    console.log("Using subnetsByName for Route53 Resolver");
  } else if (
    awsVpcResources.subnets &&
    Array.isArray(awsVpcResources.subnets) &&
    awsVpcResources.subnets.length > 0
  ) {
    subnetIds = awsVpcResources.subnets.map((s: any) => s.id).filter(Boolean);
    console.log("Using subnets array for Route53 Resolver");
  }
  return subnetIds.slice(0, 2);
};

/**
 * Helper to get security group ID for AWS Route53 Resolver
 */
const getAwsResolverSecurityGroupId = (
  awsVpcResources: AwsVpcResources,
  sgName: string,
): string | undefined => {
  if (awsVpcResources.securityGroupsByName) {
    const sg = awsVpcResources.securityGroupsByName[sgName];
    if (sg) return sg.id;
  }
  console.error(`Security group ${sgName} not found`);
  return undefined;
};

/**
 * Setup Azure Private Resolver and get its IP
 */
const setupAzureResolver = (
  scope: Construct,
  azureProvider: AzurermProvider,
  azureVnetResources: AzureVnetResources,
) => {
  console.log("Setting up Azure Private Resolver");
  const virtualNetwork = azureVnetResources.vnet as any;
  const resolver = createAzurePrivateResolver(
    scope,
    azureProvider,
    virtualNetwork,
    {
      resourceGroupName: azurePrivateZoneParams.resourceGroup,
      location: azurePrivateZoneParams.location,
      dnsResolverInboundSubnetCidr:
        azurePrivateZoneParams.dnsResolverInboundSubnetCidr,
      dnsResolverInboundSubnetName:
        azurePrivateZoneParams.dnsResolverInboundSubnetName,
      dnsResolverOutboundSubnetCidr:
        azurePrivateZoneParams.dnsResolverOutboundSubnetCidr,
      dnsResolverOutboundSubnetName:
        azurePrivateZoneParams.dnsResolverOutboundSubnetName,
      dnsPrivateResolverName: azurePrivateZoneParams.dnsPrivateResolverName,
      inboundEndpointName: azurePrivateZoneParams.inboundEndpointName,
      outboundEndpointName: azurePrivateZoneParams.outboundEndpointName,
      tags: azurePrivateZoneParams.tags,
    },
  );

  const ip = resolver.inboundEndpoint?.ipConfigurations?.privateIpAddress;
  return { resolver, ip };
};

/**
 * Setup Google DNS Inbound Policy and get its IPs
 */
const setupGoogleInboundPolicy = (
  scope: Construct,
  googleProvider: GoogleProvider,
  googleVpcResources: GoogleVpcResources,
) => {
  console.log("Setting up Google Cloud DNS Inbound Policy");
  const networkSelfLink =
    (googleVpcResources.vpc as any).selfLink ||
    (googleVpcResources.vpc as any).id ||
    googleVpcResources.vpc.name;
  const project = (googleProvider as any).project || "";

  const { policy } = createGoogleCloudDnsInboundPolicy(scope, googleProvider, {
    project,
    networkSelfLink,
    policyName: googlePrivateZoneParams.inboundServerPolicyName,
    labels: googlePrivateZoneParams.labels,
  });

  const networkName = networkSelfLink.split("/").pop() || "";
  const vpcRegion = (googleVpcResources.vpc as any).region || "asia-northeast1";

  const dnsIpsDataSource = getGoogleDnsInboundIps(scope, googleProvider, {
    project,
    networkName,
    region: vpcRegion,
    dependsOn: [policy],
  });

  return { policy, ips: dnsIpsDataSource.addresses };
};

/**
 * Setup AWS Route53 Resources
 */
const setupAwsResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  awsVpcResources: AwsVpcResources,
  azureDnsResolverIps: string[],
  googleInboundIps: any,
  awsDbResources?: AwsDbResources,
) => {
  const uniqueVpcIds = [awsVpcResources.vpc.id];
  const awsOutput: any = {};
  let awsInnerZone: Route53Zone | undefined;

  // 1. Create aws.inner zone if needed
  const needsAwsInnerZone =
    awsToAzure ||
    awsToGoogle ||
    (awsDbResources && awsPrivateZoneParams.rdsCnameRecords?.length);

  if (needsAwsInnerZone) {
    const awsInnerZones = createAwsPrivateZones(
      scope,
      awsProvider,
      uniqueVpcIds,
      [
        {
          domain: awsPrivateZoneParams.rdsInternalZone.zoneName,
          comment: awsPrivateZoneParams.rdsInternalZone.comment,
        },
      ],
      awsPrivateZoneParams.rdsInternalZone.tags,
    );
    awsInnerZone = awsInnerZones[awsPrivateZoneParams.rdsInternalZone.zoneName];
    awsOutput.zones = awsInnerZones;
  }

  // 2. Cross-cloud DNS resources
  let awsInboundEndpointIps: string[] = [];
  if (awsToAzure || awsToGoogle) {
    const subnetIds = getAwsResolverSubnetIds(awsVpcResources);
    const sgId = getAwsResolverSecurityGroupId(
      awsVpcResources,
      awsPrivateZoneParams.resolverSecurityGroupName,
    );

    if (subnetIds.length > 0 && sgId) {
      const securityGroupIds = [sgId];

      // Prepare forwarding rules
      const forwardingRules: ForwardingRule[] = [];

      if (awsToGoogle) {
        const googleIpsList = Token.asList(googleInboundIps);
        const iterator = TerraformIterator.fromList(googleIpsList);
        const googleTargetIps = iterator.dynamic({
          ip: Token.asString(iterator.getString("address")),
          port: 53,
        });

        awsPrivateZoneParams.forwardingDomains
          .filter(
            (d) =>
              d === googlePrivateZoneParams.cloudSqlARecords.internalZoneName,
          )
          .forEach((domain) => {
            forwardingRules.push({
              domain,
              targetIps: googleTargetIps,
              ruleType: "google",
            });
          });
      }

      if (awsToAzure) {
        const azureTargetIps = azureDnsResolverIps.map((ip) => ({
          ip,
          port: 53,
        }));
        awsPrivateZoneParams.forwardingDomains
          .filter(
            (d) =>
              d.includes("azure") ||
              d === azurePrivateZoneParams.azureInnerDomain.zoneName,
          )
          .forEach((domain) => {
            forwardingRules.push({
              domain,
              targetIps: azureTargetIps,
              ruleType: "azure",
            });
          });
      }

      // Create Inbound/Outbound Endpoints
      const inboundEndpoint = createAwsInboundEndpoint(scope, awsProvider, {
        endpointName:
          awsPrivateZoneParams.inboundEndpointName ||
          "aws-dns-inbound-resolver",
        resolverSubnetIds: subnetIds,
        resolverSecurityGroupIds: securityGroupIds,
        tags: awsPrivateZoneParams.tags,
      });
      awsOutput.inboundEndpoint = inboundEndpoint;
      awsInboundEndpointIps = [
        `\${tolist(${inboundEndpoint.fqn}.ip_address)[0].ip}`,
        `\${tolist(${inboundEndpoint.fqn}.ip_address)[1].ip}`,
      ];

      if (forwardingRules.length > 0) {
        const outboundResult = createAwsOutboundEndpointWithRules(
          scope,
          awsProvider,
          {
            vpcIds: uniqueVpcIds,
            forwardingRules,
            resolverSubnetIds: subnetIds,
            resolverSecurityGroupIds: securityGroupIds,
            endpointName:
              awsPrivateZoneParams.outboundEndpointName ||
              "multicloud-dns-forwarder",
            ruleNamePrefix: awsPrivateZoneParams.resolverRuleNamePrefix,
            tags: {
              ...awsPrivateZoneParams.tags,
              ...(awsToGoogle && { Purpose: "AWS-Google-DNS-Forwarding" }),
            },
          },
        );
        awsOutput.outboundEndpoint = outboundResult.outboundEndpoint;
        awsOutput.forwardingRules = outboundResult.rules;
      }
    }
  }

  // 3. RDS CNAME Records
  if (
    awsInnerZone &&
    awsPrivateZoneParams.rdsCnameRecords?.length &&
    awsDbResources
  ) {
    const cnameRecords = (awsPrivateZoneParams.rdsCnameRecords as any[])
      .map((record) => {
        let endpoint: string | undefined = record.rdsEndpoint;
        if (!endpoint) {
          if (record.type === "aurora") {
            endpoint = awsDbResources.auroraClusters?.find(
              (c) => c.clusterIdentifier === record.dbIdentifier,
            )?.endpoint;
          } else {
            endpoint = awsDbResources.rdsInstances?.find(
              (i) => i.identifier === record.dbIdentifier,
            )?.endpoint;
          }
        }
        return endpoint
          ? {
              name: `${record.shortName}.${awsPrivateZoneParams.rdsInternalZone.zoneName}`,
              target: endpoint,
            }
          : null;
      })
      .filter((r): r is { name: string; target: string } => r !== null);

    if (cnameRecords.length > 0) {
      awsOutput.rdsCnameRecords = createAwsCnameRecords(
        scope,
        awsProvider,
        awsInnerZone,
        cnameRecords,
      );
    }
  }

  return { awsOutput, awsInboundEndpointIps };
};

/**
 * Setup Google DNS Zones
 */
const setupGoogleResources = (
  scope: Construct,
  googleProvider: GoogleProvider,
  googleVpcResources: GoogleVpcResources,
  awsInboundEndpointIps: string[],
  azureDnsResolverIps: string[],
  googleCloudSqlInstances?: any[],
) => {
  const networkSelfLink =
    (googleVpcResources.vpc as any).selfLink ||
    (googleVpcResources.vpc as any).id ||
    googleVpcResources.vpc.name;
  const project = (googleProvider as any).project || "";

  let targetDnsResolverIp: string | undefined = undefined;
  if (googleToAzure && azureDnsResolverIps.length > 0) {
    targetDnsResolverIp = azureDnsResolverIps[0];
  } else if (awsToGoogle && awsInboundEndpointIps.length > 0) {
    targetDnsResolverIp = awsInboundEndpointIps[0];
  }
  const enableForwarding = !!targetDnsResolverIp;

  let filteredForwardingDomains: string[] = [];
  if (googleToAzure) {
    filteredForwardingDomains.push(
      ...googlePrivateZoneParams.forwardingDomains.filter(
        (d) =>
          d.includes("azure") ||
          d === azurePrivateZoneParams.azureInnerDomain.zoneName,
      ),
    );
  }
  if (awsToGoogle) {
    filteredForwardingDomains.push(
      ...googlePrivateZoneParams.forwardingDomains.filter(
        (d) => d === awsPrivateZoneParams.rdsInternalZone.zoneName,
      ),
    );
  }

  const googleOutput: any = createGooglePrivateDnsZones(
    scope,
    googleProvider,
    {
      project,
      networkSelfLink,
      zoneNames: enableForwarding
        ? filteredForwardingDomains
        : googlePrivateZoneParams.forwardingDomains,
      azureDnsResolverIp: targetDnsResolverIp,
      awsInboundEndpointIps: awsToGoogle ? awsInboundEndpointIps : undefined,
    },
    {
      enableForwarding,
      forwardingDomains:
        filteredForwardingDomains.length > 0
          ? filteredForwardingDomains
          : googlePrivateZoneParams.forwardingDomains,
      labels: {
        ...googlePrivateZoneParams.labels,
        ...(awsToGoogle && { "aws-dns-forwarding": "enabled" }),
        ...(googleToAzure && { "azure-dns-forwarding": "enabled" }),
      },
      forwardingZoneNamePrefix:
        googlePrivateZoneParams.forwardingZoneNamePrefix,
      forwardingZoneDescription: enableForwarding
        ? `Forwarding zone to ${awsToGoogle ? "AWS Route53 and " : ""}${
            googleToAzure ? "Azure DNS" : ""
          } Resolver`
        : googlePrivateZoneParams.forwardingZoneDescription,
      privateZoneNamePrefix: googlePrivateZoneParams.privateZoneNamePrefix,
      privateZoneDescription: googlePrivateZoneParams.privateZoneDescription,
    },
  );

  // Cloud SQL A records
  if (googleCloudSqlInstances && googleCloudSqlInstances.length > 0) {
    const cloudSqlResult = createGoogleCloudSqlARecords(scope, googleProvider, {
      project,
      networkSelfLink,
      internalZoneName:
        googlePrivateZoneParams.cloudSqlARecords.internalZoneName,
      zoneDescription: googlePrivateZoneParams.cloudSqlARecords.zoneDescription,
      cloudSqlInstances: googleCloudSqlInstances.map((i) => ({
        name: i.aRecordName,
        privateIpAddress: i.privateIpAddress,
      })),
      labels: googlePrivateZoneParams.labels,
    });
    googleOutput.cloudSqlInternalZone = cloudSqlResult.internalZone;
    googleOutput.cloudSqlARecords = cloudSqlResult.records;
  }

  return googleOutput;
};

/**
 * Setup Azure DNS Forwarding and Inner Zone
 */
const setupAzureForwardingAndInner = (
  scope: Construct,
  azureProvider: AzurermProvider,
  azureVnetResources: AzureVnetResources,
  azureResolverTemp: any,
  awsInboundEndpointIps: string[],
  googleInboundIps: any,
  azureDatabaseResources?: any[],
) => {
  const azureOutput: any = { ...azureResolverTemp };

  // 1. Forwarding Ruleset
  const shouldCreateAwsRule = awsToAzure && awsInboundEndpointIps.length > 0;
  const shouldCreateGoogleRule = googleToAzure && googleInboundIps;

  if (shouldCreateAwsRule || shouldCreateGoogleRule) {
    const forwardingRules =
      azurePrivateZoneParams.forwardingRules
        ?.filter((rule) => {
          if (rule.target === "aws") return shouldCreateAwsRule;
          if (rule.target === "google") return shouldCreateGoogleRule;
          return false;
        })
        .map((rule: any) => {
          let targetDnsServers: any = undefined;

          if (rule.target === "aws" && shouldCreateAwsRule) {
            targetDnsServers = awsInboundEndpointIps.map((ip) => ({
              ipAddress: ip,
              port: 53,
            }));
          } else if (rule.target === "google" && shouldCreateGoogleRule) {
            const googleIpsList = Token.asList(googleInboundIps);
            const iterator = TerraformIterator.fromList(googleIpsList);
            targetDnsServers = iterator.dynamic({
              ip_address: Token.asString(iterator.getString("address")),
              port: 53,
            });
          }

          return {
            name: rule.name,
            domainName: rule.domainName,
            enabled: rule.enabled,
            targetDnsServers: targetDnsServers,
          };
        }) || [];

    if (
      forwardingRules.length > 0 &&
      azurePrivateZoneParams.forwardingRulesetName
    ) {
      azureOutput.forwardingRuleset = createAzureForwardingRuleset(
        scope,
        azureProvider,
        {
          resourceGroupName: azurePrivateZoneParams.resourceGroup,
          location: azurePrivateZoneParams.location,
          outboundEndpoints: [azureResolverTemp.outboundEndpoint],
          virtualNetworkId: azureResolverTemp.virtualNetworkId,
          forwardingRulesetName: azurePrivateZoneParams.forwardingRulesetName,
          forwardingRules,
          tags: azurePrivateZoneParams.tags,
        },
      );
    }
    azureOutput.awsInboundEndpointIps = awsInboundEndpointIps;
  }

  // 2. azure.inner Zone
  if (
    azureDatabaseResources?.length &&
    azurePrivateZoneParams.azureInnerDomain?.enabled
  ) {
    const azureInnerZone = createAzureInnerPrivateDnsZone(
      scope,
      azureProvider,
      azurePrivateZoneParams.resourceGroup,
      azureVnetResources.vnet as any,
      azurePrivateZoneParams.azureInnerDomain.zoneName,
    );

    const cnameRecordsToCreate =
      azurePrivateZoneParams.azureInnerDomain.cnameRecords
        ?.filter((r) => r.enabled)
        .map((r) => ({ name: r.name, target: r.target })) || [];

    if (cnameRecordsToCreate.length > 0) {
      azureOutput.azureInnerZone = azureInnerZone;
      azureOutput.azureInnerCnameRecords = createAzureInnerCnameRecords(
        scope,
        azureProvider,
        azurePrivateZoneParams.resourceGroup,
        azureInnerZone.privateDnsZone,
        cnameRecordsToCreate,
      );
    }
  }

  return azureOutput;
};

export const createPrivateZoneResources = (
  scope: Construct,
  awsProvider?: AwsProvider,
  googleProvider?: GoogleProvider,
  azureProvider?: AzurermProvider,
  awsVpcResources?: AwsVpcResources,
  googleVpcResources?: GoogleVpcResources,
  azureVnetResources?: AzureVnetResources,
  awsDbResources?: AwsDbResources,
  googleCloudSqlInstances?: any[],
  azureDatabaseResources?: any[],
): PrivateZoneResources => {
  const output: PrivateZoneResources = {};

  // Step 1: Azure Resolver (Initial IP collection)
  let azureDnsResolverIps: string[] = [];
  let azureResolverTemp: any;
  if (azureProvider && azureVnetResources && (awsToAzure || googleToAzure)) {
    const { resolver, ip } = setupAzureResolver(
      scope,
      azureProvider,
      azureVnetResources,
    );
    azureResolverTemp = resolver;
    if (ip) azureDnsResolverIps = [ip];
  }

  // Step 2: Google Inbound Policy (Initial IP collection)
  let googleInboundPolicy: any;
  let googleInboundIps: any = [];
  if (googleProvider && googleVpcResources && (awsToGoogle || googleToAzure)) {
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
    );
    output.aws = awsOutput;
    awsInboundEndpointIps = ips;
  }

  // Step 4: Google DNS Zones
  if (googleProvider && googleVpcResources && (awsToGoogle || googleToAzure)) {
    output.google = {
      ...setupGoogleResources(
        scope,
        googleProvider,
        googleVpcResources,
        awsInboundEndpointIps,
        azureDnsResolverIps,
        googleCloudSqlInstances,
      ),
      inboundPolicy: googleInboundPolicy,
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
    );
  } else if (
    azureProvider &&
    azureVnetResources &&
    azureDatabaseResources?.length
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
    );
  }

  return output;
};
