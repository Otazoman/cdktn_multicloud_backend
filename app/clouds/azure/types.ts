import { LogAnalyticsWorkspace } from "@cdktn/provider-azurerm/lib/log-analytics-workspace";
import { createAzureDatabases } from "../../constructs/relationaldatabase/azuredatabase";
import { createAzureVnetResources } from "../../constructs/vpcnetwork/azurevnet";
import { ApplicationGateway } from "@cdktn/provider-azurerm/lib/application-gateway";
import { NetworkSecurityGroup } from "@cdktn/provider-azurerm/lib/network-security-group";
import { NetworkSecurityRule } from "@cdktn/provider-azurerm/lib/network-security-rule";
import { PublicIp } from "@cdktn/provider-azurerm/lib/public-ip";
import { Subnet as AzureSubnet } from "@cdktn/provider-azurerm/lib/subnet";
import { SubnetNetworkSecurityGroupAssociation } from "@cdktn/provider-azurerm/lib/subnet-network-security-group-association";
import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";
import { LoadBalancerDnsInfo } from "../common";

// Types of the Azure cloud module (clouds/azure).

type AzureDatabaseOutput = ReturnType<typeof createAzureDatabases>[number];

// Azure Virtual Network resources interface
export interface AzureVnetResources {
  vnet: VirtualNetwork;
  nsgs?: { [key: string]: NetworkSecurityGroup };
  nsgRules?: { [key: string]: NetworkSecurityRule[] };
  subnets: Record<string, AzureSubnet>;
  subnetAssociations?: SubnetNetworkSecurityGroupAssociation[];
  params?: ReturnType<typeof createAzureVnetResources>["params"];
  vnetTags?: { [key: string]: string };
  /**
   * The last subnet in the serial dependency chain.
   * Used to ensure VNet-mutating resources (VPN Gateway, DNS Resolver subnets)
   * are created after all regular subnets to avoid Azure's VNet provisioning state conflicts.
   */
  lastSubnet?: AzureSubnet;
}

// Azure Application Gateway output resources
export interface AzureAppGwResources {
  appGw: ApplicationGateway;
  publicIp: PublicIp;
}

// Extended Azure App Gateway resources with DNS info
export interface AzureAppGwResourcesWithDns extends AzureAppGwResources {
  dnsInfo: LoadBalancerDnsInfo;
}

// --- Azure Container App Config ---
export interface AzureContainerAppConfig {
  name: string;
  build: boolean;
  resourceGroupName: string;
  location: string;
  environmentName: string;
  image: string;
  cpu: number;
  memory: string;
  targetPort: number;
  externalEnabled: boolean;
  subnetName: string;
  env?: { name: string; value: string }[];
  minReplicas?: number;
  maxReplicas?: number;
  /** CNAME short name registered in azure.inner (e.g. "api-backend") */
  cnameRecordName?: string;
}

/**
 * Output returned by createAzureResources().
 * All Azure resources (VNet → PublicZone → Files → AzureDB → VM → AppGW+ACA → DNS A-records)
 */
export interface AzureResourcesOutput {
  /** VNet resources – passed to VPN and Private Zone orchestrators */
  vpc?: AzureVnetResources;
  /** Azure Database resources for Private Zone CNAME registration */
  dbResources?: Array<{
    server: AzureDatabaseOutput["server"];
    database: AzureDatabaseOutput["database"];
    privateDnsZone?: AzureDatabaseOutput["privateDnsZone"];
    fqdn: string;
    cnameRecordName?: string;
  }>;
  /** Azure Files metadata for Private Zone CNAME registration */
  filesInstances?: Array<{
    cnameRecordName: string;
    fqdn: string;
  }>;
  /** Azure Container Apps metadata for Private Zone CNAME registration */
  acaInstances?: Array<{
    cnameRecordName: string;
    fqdn: string;
  }>;
  /** AppGW resources with DNS info (A-record registration happens inside the orchestrator) */
  lbs?: AzureAppGwResourcesWithDns[];
  /**
   * Azure Monitor construct created up-front, exposed so that cross-cloud
   * orchestrators (e.g. vpnResources.ts) can look up the already-created
   * Log Analytics Workspace ID by name instead of creating their own.
   */
  monitorResources?: {
    logAnalyticsWorkspace?: LogAnalyticsWorkspace;
  };
}
