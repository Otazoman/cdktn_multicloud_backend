import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { Route53Zone } from "@cdktf/provider-aws/lib/route53-zone";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
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
  createAwsInboundEndpoint,
  createAwsOutboundEndpointWithRules,
  createAwsPrivateZones,
  createAwsRdsCnameRecords,
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

export const createPrivateZoneResources = (
  scope: Construct,
  awsProvider?: AwsProvider,
  googleProvider?: GoogleProvider,
  azureProvider?: AzurermProvider,
  awsVpcResources?: AwsVpcResources,
  googleVpcResources?: GoogleVpcResources,
  azureVnetResources?: AzureVnetResources,
  awsDbResources?: AwsDbResources,
  googleCloudSqlInstances?: Array<{
    name: string;
    privateIpAddress: string;
    connectionName: string;
  }>,
  azureDatabaseResources?: Array<{
    server: any;
    database: any;
    privateDnsZone?: any;
    fqdn: string;
  }>
): PrivateZoneResources => {
  const output: PrivateZoneResources = {};

  // Collect DNS endpoint IPs for cross-cloud forwarding
  let azureDnsResolverIps: string[] = [];
  let awsInboundEndpointIps: string[] = [];
  let googleInboundIps: any = []; // Google DNS uses range

  // Step 1: Create Azure DNS resolver (if needed by any Azure connection)
  let azureResolverTemp: any = undefined;
  if (azureProvider && azureVnetResources && (awsToAzure || googleToAzure)) {
    const virtualNetwork = azureVnetResources.vnet as any;
    azureResolverTemp = createAzurePrivateResolver(
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
      }
    );

    // Extract the inbound endpoint IP for use by AWS and GCP
    const azureIp =
      azureResolverTemp.inboundEndpoint?.ipConfigurations?.privateIpAddress;
    if (azureIp) {
      azureDnsResolverIps = [azureIp];
    }
  }

  // Step 2: Create Google Cloud DNS Inbound Policy first (needed for AWS forwarding)
  let googleInboundPolicy: any = undefined;
  if (googleProvider && googleVpcResources && awsToGoogle) {
    const networkSelfLink =
      (googleVpcResources.vpc as any).selfLink ||
      (googleVpcResources.vpc as any).id ||
      googleVpcResources.vpc.name;
    const project = (googleProvider as any).project || "";

    // Create Inbound Policy
    const googleInboundPolicyResult = createGoogleCloudDnsInboundPolicy(
      scope,
      googleProvider,
      {
        project: project,
        networkSelfLink: networkSelfLink,
        policyName: googlePrivateZoneParams.inboundServerPolicyName,
        labels: googlePrivateZoneParams.labels,
      }
    );
    googleInboundPolicy = googleInboundPolicyResult.policy;

    // Dynamically retrieve DNS Resolver IPs using Data Source
    const networkName = networkSelfLink.split("/").pop() || "";
    const vpcRegion =
      (googleVpcResources.vpc as any).region || "asia-northeast1";

    const dnsIpsDataSource = getGoogleDnsInboundIps(scope, googleProvider, {
      project: project,
      networkName: networkName,
      region: vpcRegion,
      dependsOn: [googleInboundPolicy],
    });

    googleInboundIps = dnsIpsDataSource.addresses;

    console.log(
      "Dynamically retrieving Google DNS inbound IPs from DNS Resolver addresses"
    );
  }

  // Step 3: Create AWS Route53 resources
  if (awsProvider && awsVpcResources) {
    const uniqueVpcIds = [awsVpcResources.vpc.id];
    const awsOutput: any = {};
    let awsInnerZone: Route53Zone | undefined;

    // Create aws.inner zone if needed (for cross-cloud or RDS CNAME)
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
        awsPrivateZoneParams.rdsInternalZone.tags
      );

      awsInnerZone =
        awsInnerZones[awsPrivateZoneParams.rdsInternalZone.zoneName];
      awsOutput.zones = awsInnerZones;
    }

    // Cross-cloud DNS resources (conditional)
    if (awsToAzure || awsToGoogle) {
      // Get subnet IDs for Route53 Resolver endpoints
      let subnetIds: string[] = [];
      if (
        awsVpcResources.subnetsByName &&
        Object.keys(awsVpcResources.subnetsByName).length > 0
      ) {
        subnetIds = Object.values(awsVpcResources.subnetsByName)
          .map((s: any) => s.id)
          .filter(Boolean)
          .slice(0, 2);
        console.log("Using subnetsByName for Route53 Resolver");
      } else if (
        awsVpcResources.subnets &&
        Array.isArray(awsVpcResources.subnets) &&
        awsVpcResources.subnets.length > 0
      ) {
        subnetIds = awsVpcResources.subnets
          .map((s: any) => s.id)
          .filter(Boolean)
          .slice(0, 2);
        console.log("Using subnets array for Route53 Resolver");
      }

      console.log(
        `Found ${subnetIds.length} subnets for Route53 Resolver:`,
        subnetIds
      );

      // Get Route53 Resolver security group ID
      const resolverSgName = awsPrivateZoneParams.resolverSecurityGroupName;
      let securityGroupIds: string[] = [];

      console.log("Looking for security group:", resolverSgName);

      if (awsVpcResources.securityGroupsByName) {
        console.log(
          "Available security groups in securityGroupsByName:",
          Object.keys(awsVpcResources.securityGroupsByName)
        );

        const resolverSecurityGroup =
          awsVpcResources.securityGroupsByName[resolverSgName];

        if (resolverSecurityGroup) {
          securityGroupIds = [resolverSecurityGroup.id];
          console.log(
            `Found security group ${resolverSgName}:`,
            resolverSecurityGroup.id
          );
        } else {
          console.error(
            `Security group ${resolverSgName} not found in securityGroupsByName. Available:`,
            Object.keys(awsVpcResources.securityGroupsByName)
          );
        }
      } else {
        console.error(
          "securityGroupsByName is not available in awsVpcResources"
        );
      }

      // Prepare forwarding rules
      const forwardingRules: ForwardingRule[] = [];
      const hasAzureForwarding = awsToAzure;
      const hasGoogleForwarding = awsToGoogle;

      // Build Google DNS forwarding rules
      if (hasGoogleForwarding) {
        const googleIpsList = Token.asList(googleInboundIps);
        const iterator = TerraformIterator.fromList(googleIpsList);
        const googleTargetIps = iterator.dynamic({
          ip: Token.asString(iterator.getString("address")),
          port: 53,
        });

        // Filter domains for Google
        const googleDomains = awsPrivateZoneParams.forwardingDomains.filter(
          (domain) => domain === "google.inner"
        );

        googleDomains.forEach((domain) => {
          forwardingRules.push({
            domain: domain,
            targetIps: googleTargetIps,
            ruleType: "google",
          });
        });

        console.log(
          `AWS-Google DNS forwarding enabled for ${googleDomains.length} domains`
        );
      }

      // Build Azure DNS forwarding rules
      if (hasAzureForwarding) {
        const azureTargetIps = azureDnsResolverIps.map((ip) => ({
          ip: ip,
          port: 53,
        }));

        // Filter domains for Azure
        const azureDomains = awsPrivateZoneParams.forwardingDomains.filter(
          (domain) => domain.includes("azure") || domain === "azure.inner"
        );

        azureDomains.forEach((domain) => {
          forwardingRules.push({
            domain: domain,
            targetIps: azureTargetIps,
            ruleType: "azure",
          });
        });

        console.log(
          `AWS-Azure DNS forwarding enabled for ${azureDomains.length} domains`
        );
      }

      // Create Inbound Endpoint (always create if subnet/SG available)
      if (subnetIds.length > 0 && securityGroupIds.length > 0) {
        const inboundEndpoint = createAwsInboundEndpoint(scope, awsProvider, {
          endpointName:
            awsPrivateZoneParams.inboundEndpointName ||
            "aws-dns-inbound-resolver",
          resolverSubnetIds: subnetIds,
          resolverSecurityGroupIds: securityGroupIds,
          tags: awsPrivateZoneParams.tags,
        });

        awsOutput.inboundEndpoint = inboundEndpoint;

        // Extract AWS Inbound Endpoint IPs
        const ip1 = `\${tolist(${inboundEndpoint.fqn}.ip_address)[0].ip}`;
        const ip2 = `\${tolist(${inboundEndpoint.fqn}.ip_address)[1].ip}`;
        awsInboundEndpointIps = [ip1, ip2];
        console.log(
          `AWS Route53 Resolver Inbound Endpoint IPs configured for cross-cloud DNS resolution`
        );
      }

      // Create Outbound Endpoint with forwarding rules
      if (
        forwardingRules.length > 0 &&
        subnetIds.length > 0 &&
        securityGroupIds.length > 0
      ) {
        const outboundResult = createAwsOutboundEndpointWithRules(
          scope,
          awsProvider,
          {
            vpcIds: uniqueVpcIds,
            forwardingRules: forwardingRules,
            resolverSubnetIds: subnetIds,
            resolverSecurityGroupIds: securityGroupIds,
            endpointName:
              awsPrivateZoneParams.outboundEndpointName ||
              "multicloud-dns-forwarder",
            ruleNamePrefix: awsPrivateZoneParams.resolverRuleNamePrefix,
            tags: {
              ...awsPrivateZoneParams.tags,
              ...(hasGoogleForwarding && {
                Purpose: "AWS-Google-DNS-Forwarding",
              }),
            },
          }
        );

        awsOutput.outboundEndpoint = outboundResult.outboundEndpoint;
        awsOutput.forwardingRules = outboundResult.rules;
      }
    }

    // Create CNAME records for RDS/Aurora endpoints
    if (
      awsInnerZone &&
      awsPrivateZoneParams.rdsCnameRecords?.length &&
      awsDbResources
    ) {
      const resolvedRecords = (
        awsPrivateZoneParams.rdsCnameRecords as Array<{
          shortName: string;
          dbIdentifier: string;
          type: "rds" | "aurora";
          rdsEndpoint?: string;
        }>
      )
        .map((record) => {
          let endpoint: string | undefined;

          if (record.rdsEndpoint) {
            endpoint = record.rdsEndpoint;
          } else if (record.type === "aurora") {
            const cluster = awsDbResources.auroraClusters?.find(
              (c) => c.clusterIdentifier === record.dbIdentifier
            );
            if (cluster) {
              endpoint = cluster.endpoint;
            }
          } else {
            const instance = awsDbResources.rdsInstances?.find(
              (i) => i.identifier === record.dbIdentifier
            );
            if (instance) {
              endpoint = instance.endpoint;
            }
          }

          if (endpoint) {
            return {
              shortName: `${record.shortName}.${awsPrivateZoneParams.rdsInternalZone.zoneName}`,
              rdsEndpoint: endpoint,
            };
          }
          return null;
        })
        .filter(
          (r): r is { shortName: string; rdsEndpoint: string } => r !== null
        );

      if (resolvedRecords.length > 0) {
        const rdsCnameRecords = createAwsRdsCnameRecords(
          scope,
          awsProvider,
          awsInnerZone,
          resolvedRecords
        );
        awsOutput.rdsCnameRecords = rdsCnameRecords;
      }
    }

    output.aws = awsOutput;
  }

  // Step 4: Create Google Cloud DNS zones and Cloud SQL A records
  if (googleProvider && googleVpcResources && (awsToGoogle || googleToAzure)) {
    const networkSelfLink =
      (googleVpcResources.vpc as any).selfLink ||
      (googleVpcResources.vpc as any).id ||
      googleVpcResources.vpc.name;
    const project = (googleProvider as any).project || "";

    let targetDnsResolverIp: string | undefined;
    let enableForwarding = false;
    let filteredForwardingDomains: string[] = [];

    // Handle Azure DNS forwarding
    if (googleToAzure && azureDnsResolverIps.length > 0) {
      targetDnsResolverIp = azureDnsResolverIps[0];
      enableForwarding = true;
      filteredForwardingDomains.push(
        ...googlePrivateZoneParams.forwardingDomains.filter(
          (domain) => domain.includes("azure") || domain === "azure.inner"
        )
      );
    }

    // Handle AWS DNS forwarding
    if (awsToGoogle) {
      if (awsInboundEndpointIps.length > 0) {
        if (!targetDnsResolverIp) {
          targetDnsResolverIp = awsInboundEndpointIps[0];
        }
        enableForwarding = true;
      }
      filteredForwardingDomains.push(
        ...googlePrivateZoneParams.forwardingDomains.filter(
          (domain) => domain === "aws.inner"
        )
      );
    }

    // Create Google DNS zones with conditional forwarding
    output.google = {
      ...createGooglePrivateDnsZones(
        scope,
        googleProvider,
        {
          project: project,
          networkSelfLink: networkSelfLink,
          zoneNames: enableForwarding
            ? filteredForwardingDomains
            : googlePrivateZoneParams.forwardingDomains,
          azureDnsResolverIp: targetDnsResolverIp,
          awsInboundEndpointIps: awsToGoogle
            ? awsInboundEndpointIps
            : undefined,
        },
        {
          enableForwarding: enableForwarding,
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
          privateZoneDescription:
            googlePrivateZoneParams.privateZoneDescription,
        }
      ),
      inboundPolicy: googleInboundPolicy,
    };

    // Create google.inner private zone and A records for Cloud SQL instances
    if (googleCloudSqlInstances && googleCloudSqlInstances.length > 0) {
      const cloudSqlResult = createGoogleCloudSqlARecords(
        scope,
        googleProvider,
        {
          project: project,
          networkSelfLink: networkSelfLink,
          internalZoneName:
            googlePrivateZoneParams.cloudSqlARecords.internalZoneName,
          zoneDescription:
            googlePrivateZoneParams.cloudSqlARecords.zoneDescription,
          cloudSqlInstances: googleCloudSqlInstances.map((instance) => {
            return {
              name: (instance as any).aRecordName,
              privateIpAddress: instance.privateIpAddress,
            };
          }),
          labels: googlePrivateZoneParams.labels,
        }
      );

      output.google.cloudSqlInternalZone = cloudSqlResult.internalZone;
      output.google.cloudSqlARecords = cloudSqlResult.records;

      console.log(
        `Created google.inner zone with ${googleCloudSqlInstances.length} A records for Cloud SQL instances`
      );
    }
  }

  // Step 5: Complete Azure DNS Forwarding Ruleset with collected IPs
  if (
    azureResolverTemp &&
    (awsInboundEndpointIps.length > 0 || googleToAzure)
  ) {
    const azProvider = azureProvider as AzurermProvider;
    const logMessages: string[] = [];
    if (awsInboundEndpointIps.length > 0) {
      logMessages.push(`AWS IPs: ${awsInboundEndpointIps.join(", ")}`);
    }
    if (googleInboundIps.length > 0) {
      logMessages.push(`Google DNS IPs: ${googleInboundIps.join(", ")}`);
    }
    console.log(
      `Creating Azure DNS Forwarding Ruleset with ${logMessages.join(" and ")}`
    );

    // Prepare forwarding rules with actual target IPs
    const forwardingRulesWithIps =
      azurePrivateZoneParams.forwardingRules
        ?.filter((rule) => rule.enabled)
        .map((rule: any) => {
          const targetIps: string[] = [];

          if (rule.target === "aws" && awsInboundEndpointIps.length > 0) {
            targetIps.push(...awsInboundEndpointIps);
          } else if (rule.target === "google" && googleInboundIps.length > 0) {
            targetIps.push(...googleInboundIps);
          }

          return {
            name: rule.name,
            domainName: rule.domainName,
            enabled: rule.enabled,
            targetIps: targetIps,
          };
        }) || [];

    // Only create forwarding ruleset if we have rules with target IPs
    let forwardingRuleset = undefined;
    if (
      forwardingRulesWithIps.some((rule) => rule.targetIps.length > 0) &&
      azurePrivateZoneParams.forwardingRulesetName
    ) {
      forwardingRuleset = createAzureForwardingRuleset(scope, azProvider, {
        resourceGroupName: azurePrivateZoneParams.resourceGroup,
        location: azurePrivateZoneParams.location,
        outboundEndpoints: [azureResolverTemp.outboundEndpoint],
        virtualNetworkId: azureResolverTemp.virtualNetworkId,
        forwardingRulesetName: azurePrivateZoneParams.forwardingRulesetName,
        forwardingRules: forwardingRulesWithIps,
        tags: azurePrivateZoneParams.tags,
      });
      console.log(
        `Azure DNS Forwarding Ruleset created with ${forwardingRulesWithIps.length} rules`
      );
    }

    output.azure = {
      ...azureResolverTemp,
      awsInboundEndpointIps: awsInboundEndpointIps,
      forwardingRuleset: forwardingRuleset,
    };
  } else if (azureResolverTemp) {
    output.azure = azureResolverTemp;
  }

  // Step 6: Create azure.inner Private DNS Zone and CNAME records
  if (
    azureProvider &&
    azureVnetResources &&
    azureDatabaseResources &&
    azureDatabaseResources.length > 0
  ) {
    if (azurePrivateZoneParams.azureInnerDomain?.enabled) {
      console.log(`Creating azure.inner Private DNS Zone for CNAME records`);

      const azureInnerZone = createAzureInnerPrivateDnsZone(
        scope,
        azureProvider,
        azurePrivateZoneParams.resourceGroup,
        azureVnetResources.vnet as any,
        azurePrivateZoneParams.azureInnerDomain.zoneName
      );

      const cnameRecordsToCreate =
        azurePrivateZoneParams.azureInnerDomain?.cnameRecords
          ?.filter((record) => record.enabled)
          ?.map((record) => ({
            name: record.name,
            target: record.target,
          })) || [];

      if (cnameRecordsToCreate.length > 0) {
        console.log(
          `Creating ${cnameRecordsToCreate.length} CNAME records in azure.inner zone`
        );

        const cnameRecords = createAzureInnerCnameRecords(
          scope,
          azureProvider,
          azurePrivateZoneParams.resourceGroup,
          azureInnerZone.privateDnsZone,
          cnameRecordsToCreate
        );

        if (!output.azure) {
          output.azure = {};
        }
        output.azure.azureInnerZone = azureInnerZone;
        output.azure.azureInnerCnameRecords = cnameRecords;

        console.log(
          `Created azure.inner zone with CNAME records:`,
          cnameRecordsToCreate.map(
            (r) => `${r.name}.azure.inner -> ${r.target}`
          )
        );
      }
    }
  }

  return output;
};
