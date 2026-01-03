import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
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
  createAwsPrivateHostedZones,
  createAwsRdsCnameRecords,
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
  let googleInboundIps: string[] = []; // Google DNS uses 35.199.192.0/19 range

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
    // Note: This IP is dynamically assigned, so we use a Terraform reference
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

    // Extract network name from selfLink (e.g., "projects/proj/global/networks/vpc" -> "vpc")
    const networkName = networkSelfLink.split("/").pop() || "";

    // Get VPC region from googleVpcResources
    const vpcRegion =
      (googleVpcResources.vpc as any).region || "asia-northeast1";

    const dnsIpsDataSource = getGoogleDnsInboundIps(scope, googleProvider, {
      project: project,
      networkName: networkName,
      region: vpcRegion,
    });

    // Extract IP addresses from the data source using Terraform expressions
    // Google DNS Resolver typically provides 2 IPs for high availability

    const googleIpsListRef = `${dnsIpsDataSource.fqn}.addresses`;
    googleInboundIps = [googleIpsListRef];
    dnsIpsDataSource.node.addDependency(googleInboundPolicy);

    console.log(
      "Dynamically retrieving Google DNS inbound IPs from DNS Resolver addresses"
    );
  }

  // Step 3: Create AWS Route53 resources
  // Step 3: Create AWS Route53 resources (if needed by conditions)
  if (awsProvider && awsVpcResources && (awsToAzure || awsToGoogle)) {
    const uniqueVpcIds = [awsVpcResources.vpc.id];

    // Get subnet IDs for Route53 Resolver endpoints (use first 2 subnets)
    let subnetIds: string[] = [];

    // Try multiple subnet sources - use subnetsByName first, then subnets array
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

    // Get Route53 Resolver security group ID by name from config
    const resolverSgName = awsPrivateZoneParams.resolverSecurityGroupName;
    let securityGroupIds: string[] = [];

    console.log("Looking for security group:", resolverSgName);

    // Use securityGroupsByName for name-based lookup
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
      console.error("securityGroupsByName is not available in awsVpcResources");
    }

    // Prepare forwarding target IPs based on enabled connections
    let allForwardingTargetIps: string[] = [];
    if (awsToAzure && azureDnsResolverIps.length > 0) {
      allForwardingTargetIps.push(...azureDnsResolverIps);
    }

    // Set Google DNS IPs for AWS Outbound Endpoint forwarding
    if (awsToGoogle && googleInboundIps.length > 0) {
      allForwardingTargetIps.push(...googleInboundIps);
      console.log(
        `AWS-Google DNS forwarding will use Google Cloud DNS Inbound Policy IPs: ${googleInboundIps.join(
          ", "
        )}`
      );
    }

    // Create AWS private zones with conditional forwarding
    const awsOutput = createAwsPrivateHostedZones(
      scope,
      awsProvider,
      {
        vpcIds: uniqueVpcIds,
        createMysqlZone: allForwardingTargetIps.length === 0 && !awsToGoogle,
        createPostgresZone: allForwardingTargetIps.length === 0 && !awsToGoogle,
        azureDnsResolverIps: azureDnsResolverIps,
        googleDnsForwardingEnabled: awsToGoogle, // Enable Google DNS forwarding support
        googleDnsIps:
          googleInboundIps.length > 0 ? googleInboundIps : undefined, // Pass Google DNS IPs for outbound forwarding
        resolverSubnetIds: subnetIds.length > 0 ? subnetIds : undefined,
        resolverSecurityGroupIds:
          securityGroupIds.length > 0 ? securityGroupIds : undefined,
      },
      {
        enableConditionalForwarding:
          (awsToAzure && azureDnsResolverIps.length > 0) || awsToGoogle,
        forwardingDomains: awsPrivateZoneParams.forwardingDomains.filter(
          (domain) => {
            // Filter domains based on active connections
            if (domain === "google.inner") return awsToGoogle;
            if (domain.includes("azure") || domain === "azure.inner")
              return awsToAzure;
            return awsToAzure; // Default to Azure domains for backward compatibility
          }
        ),
        tags: {
          ...awsPrivateZoneParams.tags,
          ...(awsToGoogle && { Purpose: "AWS-Google-DNS-Forwarding" }),
        },
        outboundEndpointName: awsPrivateZoneParams.outboundEndpointName,
        resolverRuleNamePrefix: awsPrivateZoneParams.resolverRuleNamePrefix,
        privateZoneComments: awsPrivateZoneParams.privateZoneComments,
        inboundEndpointName: awsPrivateZoneParams.inboundEndpointName,
      }
    );

    output.aws = awsOutput;

    // Extract AWS Inbound Endpoint IPs (if created)
    if (awsOutput.inboundEndpoint) {
      // Use Terraform's tolist() function to convert set to list for proper indexing
      // Route53 Resolver endpoints typically have 2 IPs across different AZs
      const ip1 = `\${tolist(${awsOutput.inboundEndpoint.fqn}.ip_address)[0].ip}`;
      const ip2 = `\${tolist(${awsOutput.inboundEndpoint.fqn}.ip_address)[1].ip}`;
      awsInboundEndpointIps = [ip1, ip2];
      console.log(
        `AWS Route53 Resolver Inbound Endpoint IPs configured for cross-cloud DNS resolution`
      );
    }

    // Create CNAME records for RDS/Aurora endpoints (short names)
    // Only create if DB resources are provided (when awsToAzure or awsToGoogle is true)
    if (awsPrivateZoneParams.rdsCnameRecords?.length && awsDbResources) {
      // Resolve RDS/Aurora endpoints from actual DB resources
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
            // Use provided endpoint if available
            endpoint = record.rdsEndpoint;
          } else if (record.type === "aurora") {
            // Find Aurora cluster by identifier
            const cluster = awsDbResources.auroraClusters?.find(
              (c) => c.clusterIdentifier === record.dbIdentifier
            );
            if (cluster) {
              // Use actual cluster endpoint (includes MultiAZ handling)
              endpoint = cluster.endpoint;
            }
          } else {
            // Find RDS instance by identifier
            const instance = awsDbResources.rdsInstances?.find(
              (i) => i.identifier === record.dbIdentifier
            );
            if (instance) {
              // Use actual instance endpoint (includes MultiAZ handling)
              endpoint = instance.endpoint;
            }
          }

          // Return record only if endpoint was found
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

      // Only create CNAME records if we have resolved records
      if (resolvedRecords.length > 0) {
        const rdsCnameRecords = createAwsRdsCnameRecords(
          scope,
          awsProvider,
          uniqueVpcIds,
          awsPrivateZoneParams.rdsInternalZone.zoneName,
          awsPrivateZoneParams.rdsInternalZone.comment,
          awsPrivateZoneParams.rdsInternalZone.tags,
          resolvedRecords
        );
        output.aws.rdsCnameRecords = rdsCnameRecords;
      }
    }

    // Example: Add custom CNAME records in Azure privatelink zones if needed
    // (Only applicable when not using conditional forwarding)
    if (azureDnsResolverIps.length === 0 && output.aws.zones) {
      const mysqlZone =
        output.aws.zones["privatelink.mysql.database.azure.com"];
      if (mysqlZone) {
        // Example CNAME - customize as needed
        createAwsCnameRecords(scope, awsProvider, mysqlZone, [
          // Uncomment and customize:
          // {
          //   name: "azure-mysql-server",
          //   cname: "actual-azure-mysql-server.privatelink.mysql.database.azure.com",
          // },
        ]);
      }
    }
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
        // HA VPN case: forward to AWS Route53 Resolver inbound endpoints
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
      // Import the createGoogleCloudSqlARecords function

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
            // Use aRecordName directly from CloudSQL config
            // e.g., "cloudsql-mysql.google.inner"
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
    // Import Azure Forwarding Ruleset function
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

          // Add target IPs based on the 'target' property in config
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

  // Step 5: Create azure.inner Private DNS Zone and CNAME records (if Azure databases exist)
  if (
    azureProvider &&
    azureVnetResources &&
    azureDatabaseResources &&
    azureDatabaseResources.length > 0
  ) {
    // Create azure.inner Private DNS Zone if enabled
    if (azurePrivateZoneParams.azureInnerDomain?.enabled) {
      console.log(`Creating azure.inner Private DNS Zone for CNAME records`);

      const azureInnerZone = createAzureInnerPrivateDnsZone(
        scope,
        azureProvider,
        azurePrivateZoneParams.resourceGroup,
        azureVnetResources.vnet as any,
        azurePrivateZoneParams.azureInnerDomain.zoneName
      );

      // Create CNAME records directly from configuration
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

        // Add to output
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
