import { Ec2InstanceConnectEndpoint } from "@cdktf/provider-aws/lib/ec2-instance-connect-endpoint";
import { SecurityGroup } from "@cdktf/provider-aws/lib/security-group";
import { Vpc as AwsVpc } from "@cdktf/provider-aws/lib/vpc";
import { NetworkSecurityGroup } from "@cdktf/provider-azurerm/lib/network-security-group";
import { NetworkSecurityRule } from "@cdktf/provider-azurerm/lib/network-security-rule";
import { Subnet as AzureSubnet } from "@cdktf/provider-azurerm/lib/subnet";
import { SubnetNetworkSecurityGroupAssociation } from "@cdktf/provider-azurerm/lib/subnet-network-security-group-association";
import { VirtualNetwork } from "@cdktf/provider-azurerm/lib/virtual-network";
import { ComputeFirewall } from "@cdktf/provider-google/lib/compute-firewall";
import { ComputeNetwork as GoogleVpc } from "@cdktf/provider-google/lib/compute-network";
import { ComputeSubnetwork } from "@cdktf/provider-google/lib/compute-subnetwork";
import { Token } from "cdktf";

// AWS
export interface AwsVpcResources {
  vpc: AwsVpc;
  subnets: any[] | { id: string }[];
  subnetsByName:
    | Record<string, any>
    | Record<string, { id: string; name: string }>;
  securityGroups: SecurityGroup[] | { id: string; name: string }[];
  securityGroupMapping: { [key: string]: Token };
  ec2InstanceConnectEndpoint?: Ec2InstanceConnectEndpoint;
}

// Google Cloud
export interface GoogleVpcResources {
  vpc: GoogleVpc;
  subnets: ComputeSubnetwork[];
  sshrule: ComputeFirewall;
  ingressrules: ComputeFirewall[];
  egressrules: ComputeFirewall[];
}

// Azure
export interface AzureVnetResources {
  vnet: VirtualNetwork | { name: string };
  nsg?: NetworkSecurityGroup;
  nsgRules?: NetworkSecurityRule[];
  subnets:
    | Record<string, AzureSubnet>
    | Record<string, { id: string; name: string }>;
  subnetAssociations?: SubnetNetworkSecurityGroupAssociation[];
  params?: any;
}

// VPC Resources
export interface VpcResources {
  awsVpcResources?: AwsVpcResources;
  googleVpcResources?: GoogleVpcResources;
  azureVnetResources?: AzureVnetResources;
}

// VPN Resources
export interface VpnResources {
  awsVpnGateway?: any;
  googleVpnGateways?: any;
  awsGoogleCgwVpns?: any[];
  awsGoogleVpnTunnels?: any[];
  azureVng?: any;
  awsAzureCgwVpns?: any[];
  awsAzureLocalGateways?: any[];
  googleAzureVpnGateways?: any;
  azureGoogleVpnTunnels?: any[];
  googleAzureLocalGateways?: any[];
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
