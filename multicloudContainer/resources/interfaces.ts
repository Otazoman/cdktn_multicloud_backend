import { Ec2InstanceConnectEndpoint } from "@cdktn/provider-aws/lib/ec2-instance-connect-endpoint";
import { Lb } from "@cdktn/provider-aws/lib/lb";
import { LbListener } from "@cdktn/provider-aws/lib/lb-listener";
import { LbTargetGroup } from "@cdktn/provider-aws/lib/lb-target-group";
import { SecurityGroup } from "@cdktn/provider-aws/lib/security-group";
import { Vpc as AwsVpc } from "@cdktn/provider-aws/lib/vpc";
import { ApplicationGateway } from "@cdktn/provider-azurerm/lib/application-gateway";
import { NetworkSecurityGroup } from "@cdktn/provider-azurerm/lib/network-security-group";
import { NetworkSecurityRule } from "@cdktn/provider-azurerm/lib/network-security-rule";
import { PublicIp } from "@cdktn/provider-azurerm/lib/public-ip";
import { Subnet as AzureSubnet } from "@cdktn/provider-azurerm/lib/subnet";
import { SubnetNetworkSecurityGroupAssociation } from "@cdktn/provider-azurerm/lib/subnet-network-security-group-association";
import { VirtualNetwork } from "@cdktn/provider-azurerm/lib/virtual-network";
import { ComputeAddress } from "@cdktn/provider-google/lib/compute-address";
import { ComputeBackendService } from "@cdktn/provider-google/lib/compute-backend-service";
import { ComputeFirewall } from "@cdktn/provider-google/lib/compute-firewall";
import { ComputeForwardingRule } from "@cdktn/provider-google/lib/compute-forwarding-rule";
import { ComputeGlobalAddress } from "@cdktn/provider-google/lib/compute-global-address";
import { ComputeGlobalForwardingRule } from "@cdktn/provider-google/lib/compute-global-forwarding-rule";
import { ComputeNetwork as GoogleVpc } from "@cdktn/provider-google/lib/compute-network";
import { ComputeRegionUrlMap } from "@cdktn/provider-google/lib/compute-region-url-map";
import { ComputeSubnetwork } from "@cdktn/provider-google/lib/compute-subnetwork";
import { ComputeUrlMap } from "@cdktn/provider-google/lib/compute-url-map";
import { Token } from "cdktf";

// AWS VPC resources interface
export interface AwsVpcResources {
  vpc: AwsVpc;
  subnets: any[] | { id: string }[];
  subnetsByName:
    | Record<string, any>
    | Record<string, { id: string; name: string }>;
  securityGroups: SecurityGroup[] | { id: string; name: string }[];
  securityGroupsByName?: Record<string, SecurityGroup>;
  securityGroupMapping: { [key: string]: Token };
  publicRouteTable: any | { id: string; name: string };
  privateRouteTable: any | { id: string; name: string };
  ec2InstanceConnectEndpoint?: Ec2InstanceConnectEndpoint;
}

// Google Cloud VPC resources interface
export interface GoogleVpcResources {
  vpc: GoogleVpc;
  subnets: ComputeSubnetwork[];
  proxySubnets?: ComputeSubnetwork[];
  ingressrules: ComputeFirewall[];
  egressrules: ComputeFirewall[];
  vpcLabels?: { [key: string]: string };
}

// Azure Virtual Network resources interface
export interface AzureVnetResources {
  vnet: VirtualNetwork | { name: string };
  nsgs?: { [key: string]: NetworkSecurityGroup };
  nsgRules?: { [key: string]: NetworkSecurityRule[] };
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

// AWS RDS/Aurora resources interface
export interface AwsDbResources {
  rdsInstances?: Array<{
    identifier: string;
    endpoint: string;
    address: string;
    port: number;
  }>;
  auroraClusters?: Array<{
    clusterIdentifier: string;
    endpoint: string;
    readerEndpoint?: string;
    port: number;
  }>;
}
// Additional properties can be added as needed
export interface DatabaseResourcesOutput {
  googleCloudSqlConnectionNames: {
    [instanceName: string]: string;
  };
  googleCloudSqlInstances?: Array<{
    name: string;
    privateIpAddress: string;
    connectionName: string;
    aRecordName: string; // DNS A record name for google.inner zone
  }>;
  awsDbResources?: AwsDbResources;
  azureDatabaseResources?: Array<{
    server: any;
    database: any;
    privateDnsZone?: any;
    fqdn: string;
  }>;
}

// Common Private Zone resources interface
export interface PrivateZoneResources {
  aws?: any;
  google?: any;
  azure?: any;
}

// AWS Application Load Balancer output resources
export interface AwsAlbResources {
  alb: Lb;
  targetGroups: Record<string, LbTargetGroup>; // Key is the logical name from config
  listener: LbListener;
}

// Google Cloud Load Balancing output resources
export interface GoogleGlobalLbResources {
  forwardingRule: ComputeGlobalForwardingRule;
  backendServices: Record<string, ComputeBackendService>;
  urlMap: ComputeUrlMap;
  staticIp?: ComputeGlobalAddress;
  dnsInfo?: LoadBalancerDnsInfo; // DNS information for this LB
}

export interface GoogleRegionalLbResources {
  forwardingRule: ComputeForwardingRule;
  backendServices: Record<string, ComputeBackendService>;
  urlMap: ComputeRegionUrlMap;
  staticIp?: ComputeAddress;
  dnsInfo?: LoadBalancerDnsInfo; // DNS information for this LB
}

export interface GoogleLbResourcesOutput {
  global?: GoogleGlobalLbResources[];
  regional?: GoogleRegionalLbResources[];
}

// Combined Load Balancer resources for the orchestration layer
export interface LbResourcesOutput {
  awsAlbs?: AwsAlbResources[];
  googleLbs?: GoogleLbResourcesOutput[];
}

// Azure Application Gateway output resources
export interface AzureAppGwResources {
  appGw: ApplicationGateway;
  publicIp: PublicIp;
}

// ========================================
// DNS and Certificate Configuration
// ========================================

// DNS configuration for load balancers
export interface DnsConfig {
  subdomain: string; // e.g., "awstest.tohonokai.com"
  fqdn?: string; // Optional specific FQDN for this LB, e.g., "api.awstest.tohonokai.com"
}

// AWS Certificate configuration
export interface AwsCertificateConfig {
  enabled: boolean;
  domains: string[]; // e.g., ["*.awstest.tohonokai.com", "awstest.tohonokai.com"]
  validationZone: string; // Zone name for DNS validation
}

// Google Managed SSL configuration
export interface GoogleManagedSslConfig {
  enabled: boolean;
  domains: string[]; // e.g., ["*.googletest.tohonokai.com", "googletest.tohonokai.com"]
  sslCertificateNames?: string[]; // Optional: existing certificate names to include
}

// DNS information output from load balancer creation
export interface LoadBalancerDnsInfo {
  subdomain: string;
  fqdn?: string;
  ipAddress?: string; // For Google and Azure
  dnsName?: string; // For AWS ALB
  zoneId?: string; // Public zone ID if created
  nsRecords?: string[]; // NS records for delegation
}

// Extended AWS ALB resources with DNS info
export interface AwsAlbResourcesWithDns extends AwsAlbResources {
  dnsInfo: LoadBalancerDnsInfo;
  certificateArn?: string; // ARN of the created certificate
}

// Extended Google LB resources with DNS info
export interface GoogleLbResourcesWithDns {
  global?: GoogleGlobalLbResources[];
  regional?: GoogleRegionalLbResources[];
}

// Extended Azure App Gateway resources with DNS info
export interface AzureAppGwResourcesWithDns extends AzureAppGwResources {
  dnsInfo: LoadBalancerDnsInfo;
}

// Load balancer resources with DNS information
export interface LbResourcesOutputWithDns {
  awsAlbs?: AwsAlbResourcesWithDns[];
  googleLbs?: GoogleLbResourcesWithDns[];
  azureAppGws?: AzureAppGwResourcesWithDns[];
}

// Public DNS Zone resources
export interface PublicDnsZoneResources {
  awsZones?: Record<string, any>; // Route53 zones
  googleZones?: Record<string, any>; // Cloud DNS zones
  azureZones?: Record<string, any>; // Azure DNS zones
}
