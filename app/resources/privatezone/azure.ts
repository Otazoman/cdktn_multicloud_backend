import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { TerraformIterator, Token } from "cdktn";
import { Construct } from "constructs";
import { azurePrivateZoneParams } from "../../config/azure/privatezone";
import { isConnected } from "../../config/connections";
import {
  createAzureFilesInnerCnameRecords,
  createAzureForwardingRuleset,
  createAzureInnerCnameRecords,
  createAzureInnerPrivateDnsZone,
  createAzurePrivateResolver,
} from "../../constructs/dns/privatezone/azureprivatezone";
import { AzureVnetResources } from "../../clouds/azure/types";
import { VpnResources } from "../vpn/types";
import { hasGoogleInboundIps } from "./helpers";

// Azure side of cross-cloud private DNS (Private DNS Resolver, forwarding
// ruleset to AWS / Google, azure.inner zone).

/**
 * Setup Azure Private Resolver and get its IP
 */
export const setupAzureResolver = (
  scope: Construct,
  azureProvider: AzurermProvider,
  azureVnetResources: AzureVnetResources,
  vpnResources?: VpnResources,
) => {
  console.log("Setting up Azure Private Resolver");
  const virtualNetwork = azureVnetResources.vnet;

  // Build dependency array: wait for VPN Gateway subnet if available
  const gatewaySubnet = vpnResources?.gateways.azure?.gatewaySubnet;
  const dependsOn = gatewaySubnet
    ? [gatewaySubnet]
    : undefined;

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
    dependsOn,
  );

  const ip = resolver.inboundEndpoint?.ipConfigurations?.privateIpAddress;
  return { resolver, ip };
};

/**
 * Setup Azure DNS Forwarding and Inner Zone
 */
export const setupAzureForwardingAndInner = (
  scope: Construct,
  azureProvider: AzurermProvider,
  azureVnetResources: AzureVnetResources,
  azureResolverTemp: any,
  awsInboundEndpointIps: string[],
  googleInboundIps: any,
  azureDatabaseResources?: any[],
  azureFilesInstances?: Array<{ cnameRecordName: string; fqdn: string }>,
  azureAcaInstances?: Array<{ cnameRecordName: string; fqdn: string }>,
) => {
  const azureOutput: any = azureResolverTemp ? { ...azureResolverTemp } : {};

  // 1. Forwarding Ruleset
  const shouldCreateAwsRule =
    isConnected("aws", "azure") && awsInboundEndpointIps.length > 0;
  const shouldCreateGoogleRule =
    isConnected("google", "azure") && hasGoogleInboundIps(googleInboundIps);

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
        })
        .filter((rule) => rule.targetDnsServers !== undefined) || [];

    if (
      forwardingRules.length > 0 &&
      azurePrivateZoneParams.forwardingRulesetName &&
      azureResolverTemp
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
          vnetLinkName: azurePrivateZoneParams.forwardingRulesetVnetLinkName,
          forwardingRules,
          tags: azurePrivateZoneParams.tags,
        },
      );
    }
    azureOutput.awsInboundEndpointIps = awsInboundEndpointIps;
  }

  // 2. azure.inner Zone
  // Created when: DB records exist OR Azure Files CNAME records exist OR ACA instances exist
  const needsAzureInnerZone =
    azurePrivateZoneParams.azureInnerDomain?.enabled &&
    (azureDatabaseResources?.length ||
      azureFilesInstances?.length ||
      azureAcaInstances?.length);

  if (needsAzureInnerZone) {
    const azureInnerZone = createAzureInnerPrivateDnsZone(
      scope,
      azureProvider,
      azurePrivateZoneParams.resourceGroup,
      azureVnetResources.vnet,
      azurePrivateZoneParams.azureInnerDomain.zoneName,
      azurePrivateZoneParams.azureInnerDomain.vnetLinkName,
    );
    azureOutput.azureInnerZone = azureInnerZone;

    // 2a. DB CNAME records (dynamically generated from databases.ts cnameRecordName field)
    // azureDatabaseResources carries { fqdn, cnameRecordName } collected in databaseResources.ts
    const cnameRecordsToCreate = (azureDatabaseResources ?? [])
      .filter((r) => r.cnameRecordName && r.fqdn)
      .map((r) => ({
        name: r.cnameRecordName as string,
        target: r.fqdn,
      }));

    if (cnameRecordsToCreate.length > 0) {
      azureOutput.azureInnerCnameRecords = createAzureInnerCnameRecords(
        scope,
        azureProvider,
        azureInnerZone.privateDnsZone,
        cnameRecordsToCreate,
      );
    }

    // 2b. Azure Files CNAME records
    if (azureFilesInstances && azureFilesInstances.length > 0) {
      azureOutput.azureFilesCnameRecords = createAzureFilesInnerCnameRecords(
        scope,
        azureProvider,
        azureInnerZone.privateDnsZone,
        azureFilesInstances.map((i) => ({
          name: i.cnameRecordName,
          fqdn: i.fqdn,
        })),
      );
    }

    // 2c. ACA CNAME records (latestRevisionFqdn → cnameRecordName.azure.inner)
    if (azureAcaInstances && azureAcaInstances.length > 0) {
      azureOutput.azureAcaCnameRecords = createAzureInnerCnameRecords(
        scope,
        azureProvider,
        azureInnerZone.privateDnsZone,
        azureAcaInstances.map((i) => ({
          name: i.cnameRecordName,
          target: i.fqdn,
        })),
      );
    }
  }

  return azureOutput;
};
