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
import { createAzurePrivateResolver } from "../constructs/privatezone/azureprivatezone";
import { createGooglePrivateDnsZones } from "../constructs/privatezone/googleprivatezone";
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

  // Note: Azure DNS resolver setup will be done after AWS/Google to get their IPs

  // Temporary: Create Azure DNS resolver first to get IP, then recreate later with forwarding
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

  // Step 2: Create AWS Route53 resources (if needed by conditions)
  if (awsProvider && awsVpcResources && (awsToAzure || awsToGoogle)) {
    const uniqueVpcIds = [awsVpcResources.vpc.id];

    // Get subnet IDs for Route53 Resolver endpoints (use first 2 subnets)
    let subnetIds: string[] = [];

    // // Debug: Check available subnet structures
    // console.log("AWS VPC Resources available subnets:", {
    //   subnetsByName: Object.keys(awsVpcResources.subnetsByName || {}),
    //   subnets: Array.isArray(awsVpcResources.subnets)
    //     ? awsVpcResources.subnets.length
    //     : 0,
    // });

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

    // Create AWS private zones with conditional forwarding
    const awsOutput = createAwsPrivateHostedZones(
      scope,
      awsProvider,
      {
        vpcIds: uniqueVpcIds,
        createMysqlZone: azureDnsResolverIps.length === 0, // Only create local zones if not forwarding
        createPostgresZone: azureDnsResolverIps.length === 0,
        azureDnsResolverIps: azureDnsResolverIps,
        resolverSubnetIds: subnetIds.length > 0 ? subnetIds : undefined,
        resolverSecurityGroupIds:
          securityGroupIds.length > 0 ? securityGroupIds : undefined,
      },
      {
        enableConditionalForwarding:
          awsToAzure && azureDnsResolverIps.length > 0,
        forwardingDomains: awsPrivateZoneParams.forwardingDomains,
        tags: awsPrivateZoneParams.tags,
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
        `AWS Route53 Resolver Inbound Endpoint IPs configured for Azure DNS forwarding`
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

  // Step 3: Create Google Cloud DNS resources (if needed by conditions)
  if (googleProvider && googleVpcResources && (awsToGoogle || googleToAzure)) {
    const networkSelfLink =
      (googleVpcResources.vpc as any).selfLink ||
      (googleVpcResources.vpc as any).id ||
      googleVpcResources.vpc.name;

    const project = (googleProvider as any).project || "";

    // Create Google DNS zones with forwarding to Azure (if googleToAzure)
    output.google = createGooglePrivateDnsZones(
      scope,
      googleProvider,
      {
        project: project,
        networkSelfLink: networkSelfLink,
        zoneNames: googlePrivateZoneParams.forwardingDomains,
        azureDnsResolverIp: googleToAzure ? azureDnsResolverIps[0] : undefined,
      },
      {
        enableForwarding: googleToAzure && azureDnsResolverIps.length > 0,
        forwardingDomains: googlePrivateZoneParams.forwardingDomains,
        labels: googlePrivateZoneParams.labels,
        forwardingZoneNamePrefix:
          googlePrivateZoneParams.forwardingZoneNamePrefix,
        forwardingZoneDescription:
          googlePrivateZoneParams.forwardingZoneDescription,
        privateZoneNamePrefix: googlePrivateZoneParams.privateZoneNamePrefix,
        privateZoneDescription: googlePrivateZoneParams.privateZoneDescription,
      }
    );

    // Create A records for Cloud SQL instances (short names)
    if (googleCloudSqlInstances && googleCloudSqlInstances.length > 0) {
      const {
        createGoogleCloudSqlARecords,
      } = require("../constructs/privatezone/googleprivatezone");

      const cloudSqlAResult = createGoogleCloudSqlARecords(
        scope,
        googleProvider,
        {
          project: project,
          networkSelfLink: networkSelfLink,
          internalZoneName:
            googlePrivateZoneParams.cloudSqlARecords.internalZoneName,
          zoneDescription:
            googlePrivateZoneParams.cloudSqlARecords.zoneDescription,
          cloudSqlInstances: googleCloudSqlInstances,
          labels: googlePrivateZoneParams.labels,
        }
      );

      output.google.cloudSqlInternalZone = cloudSqlAResult.internalZone;
      output.google.cloudSqlARecords = cloudSqlAResult.records;
    }
  }

  // Step 4: Complete Azure DNS Forwarding Ruleset with collected IPs
  if (
    azureResolverTemp &&
    (awsInboundEndpointIps.length > 0 || googleToAzure)
  ) {
    // Import Azure Forwarding Ruleset function
    const {
      createAzureForwardingRuleset,
    } = require("../constructs/privatezone/azureprivatezone");

    console.log(
      `Creating Azure DNS Forwarding Ruleset with AWS IPs: ${awsInboundEndpointIps.join(
        ", "
      )}`
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
          }

          // Future: Add Google Cloud DNS IPs for Google domains

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
      forwardingRuleset = createAzureForwardingRuleset(scope, azureProvider, {
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
    const {
      createAzureInnerPrivateDnsZone,
      createAzureInnerCnameRecords,
    } = require("../constructs/privatezone/azureprivatezone");

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
