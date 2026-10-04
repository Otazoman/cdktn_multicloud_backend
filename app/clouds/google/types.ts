import { ComputeRegionBackendService } from "@cdktn/provider-google/lib/compute-region-backend-service";
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
import { DnsManagedZone } from "@cdktn/provider-google/lib/dns-managed-zone";
import { ITerraformDependable } from "cdktn";
import { LoadBalancerDnsInfo } from "../common";

// Types of the Google Cloud module (clouds/google).

// Google Cloud VPC resources interface
export interface GoogleVpcResources {
  vpc: GoogleVpc;
  subnets: ComputeSubnetwork[];
  /** subnets keyed by name for easy lookup (e.g. subnetsByName["app-subnet"]) */
  subnetsByName: Record<string, ComputeSubnetwork>;
  proxySubnets?: ComputeSubnetwork[];
  ingressrules: ComputeFirewall[];
  egressrules: ComputeFirewall[];
  vpcLabels?: { [key: string]: string };
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
  backendServices: Record<string, ComputeRegionBackendService>;
  urlMap: ComputeRegionUrlMap;
  staticIp?: ComputeAddress;
  dnsInfo?: LoadBalancerDnsInfo; // DNS information for this LB
}

// Extended Google LB resources with DNS info
export interface GoogleLbResourcesWithDns {
  global?: GoogleGlobalLbResources[];
  regional?: GoogleRegionalLbResources[];
}

/**
 * Output returned by createGoogleResources().
 * All Google resources (VPC → PublicZone → Filestore → CloudSQL → GCE → CloudRun → LB → DNS A-records)
 * are created inside one orchestrator, so cross-resource Construct references are available for
 * proper depends_on generation – this is the key fix for the VPC zombie-deletion issue.
 */
export interface GoogleResourcesOutput {
  /** VPC resources – passed to VPN and Private Zone orchestrators */
  vpc?: GoogleVpcResources;
  /** Public DNS zones – created inside the orchestrator (internal use; exposed for debugging) */
  publicZones?: Record<string, DnsManagedZone>;
  /** LB resources with DNS info (A-record registration happens inside the orchestrator) */
  lbs?: GoogleLbResourcesWithDns[];
  /** CloudSQL instance metadata for Private Zone A-record registration */
  cloudSqlInstances?: Array<{
    name: string;
    privateIpAddress: string;
    connectionName: string;
    aRecordName: string;
  }>;
  /** Filestore instance metadata for Private Zone A-record registration */
  filestoreInstances?: Array<{
    aRecordName: string;
    privateIpAddress: string;
  }>;
  /**
   * PSA TerraformResource references (ServiceNetworkingConnection +
   * ComputeNetworkPeeringRoutesConfig).
   * Consumed internally to ensure GCE / VM placement waits for PSA peering routes.
   */
  psaDependencies?: ITerraformDependable[];
}
