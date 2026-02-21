import { Ec2InstanceConnectEndpoint } from "@cdktn/provider-aws/lib/ec2-instance-connect-endpoint";
import { SecurityGroup } from "@cdktn/provider-aws/lib/security-group";
import { Vpc as AwsVpc } from "@cdktn/provider-aws/lib/vpc";
import { NetworkSecurityGroup } from "@cdktn/provider-azurerm/lib/network-security-group";
import { NetworkSecurityRule } from "@cdktn/provider-azurerm/lib/network-security-rule";
import { Subnet as AzureSubnet } from "@cdktn/provider-azurerm/lib/subnet";
import { SubnetNetworkSecurityGroupAssociation } from "@cdktn/provider-azurerm/lib/subnet-network-security-group-association";
import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";
import { ComputeFirewall } from "@cdktn/provider-google/lib/compute-firewall";
import { ComputeNetwork as GoogleVpc } from "@cdktn/provider-google/lib/compute-network";
import { ComputeSubnetwork } from "@cdktn/provider-google/lib/compute-subnetwork";
import { Token } from "cdktf";

// AWS VPC resources interface
export interface AwsVpcResources {
  vpc: AwsVpc;
  subnets: any[] | { id: string }[];
  subnetsByName:
    | Record<string, any>
    | Record<string, { id: string; name: string }>;
  securityGroups: SecurityGroup[] | { id: string; name: string }[];
  securityGroupMapping: { [key: string]: Token };
  privateRouteTable: any | { id: string; name: string };
  ec2InstanceConnectEndpoint?: Ec2InstanceConnectEndpoint;
}

// Google Cloud VPC resources interface
export interface GoogleVpcResources {
  vpc: GoogleVpc;
  subnets: ComputeSubnetwork[];
  ingressrules: ComputeFirewall[];
  egressrules: ComputeFirewall[];
  vpcLabels?: { [key: string]: string };
}

// Azure Virtual Network resources interface
export interface AzureVnetResources {
  vnet: VirtualNetwork | { name: string };
  nsg?: NetworkSecurityGroup;
  nsgRules?: NetworkSecurityRule[];
  subnets:
    | Record<string, AzureSubnet>
    | Record<string, { id: string; name: string }>;
  subnetAssociations?: SubnetNetworkSecurityGroupAssociation[];
  params?: any;
  vnetTags?: { [key: string]: string };
}

// Common VPC resources interface
export interface VpcResources {
  awsVpcResources?: AwsVpcResources;
  googleVpcResources?: GoogleVpcResources;
  azureVnetResources?: AzureVnetResources;
}

// Common VPN resources interface
export interface VpnResources {
  awsVpnGateway?: any;
  googleVpnGateway?: any;
  googleVpnGateways?: any;
  googleAwsVpnGateways?: any;
  googleAzureVpnGateways?: any;
  azureVng?: any;
  azureRouteServer?: any;
  awsGoogleCgwVpns?: any[];
  awsAzureCgwVpns?: any[];
  awsGoogleVpnTunnels?: any;
  azureGoogleVpnTunnels?: any;
  awsAzureLocalGateways?: any[];
  googleAzureLocalGateways?: any[];
}

// Azure Virtual WAN resources interface
export interface AzureVirtualWanResources {
  azureVirtualWan?: any;
}

export interface TunnelConfig {
  address: string;
  preshared_key?: string;
  shared_key?: string;
  apipaCidr?: string;
  peerAddress?: string;
  cidrhost?: string;
  ipAddress?: string;
}

// Azure Route Server configuration interface
export interface AzureRouteServerConfig {
  routeServerName: string;
  routeServerSubnetCidr: string;
  routeServerAsn: number;
  vpnGatewayBgpPeeringAddress1: string;
  vpnGatewayBgpPeeringAddress2: string;
  virtualRouterIps: string[];
  bgpConnections: {
    vpnGateway: BgpConnectionConfig;
    googleCloudRouter: GoogleBgpConnectionConfig;
  };
  nsgRules: NsgRuleConfig[];
}

export interface BgpConnectionConfig {
  enabled: boolean;
  peerAsn: number;
}

export interface GoogleBgpConnectionConfig extends BgpConnectionConfig {
  peerIpAddresses: string[];
  connectionNames: string[];
}

export interface NsgRuleConfig {
  name: string;
  priority: number;
  direction: "Inbound" | "Outbound";
  access: "Allow" | "Deny";
  protocol: string;
  sourcePortRange: string;
  destinationPortRange: string;
  sourceAddressPrefix: string;
  destinationAddressPrefix: string;
}
