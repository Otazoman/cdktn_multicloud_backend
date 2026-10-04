import { LbListenerRule } from "@cdktn/provider-aws/lib/lb-listener-rule";
import { RouteTable } from "@cdktn/provider-aws/lib/route-table";
import { Subnet } from "@cdktn/provider-aws/lib/subnet";
import { Ec2InstanceConnectEndpoint } from "@cdktn/provider-aws/lib/ec2-instance-connect-endpoint";
import { Lb } from "@cdktn/provider-aws/lib/lb";
import { LbListener } from "@cdktn/provider-aws/lib/lb-listener";
import { LbTargetGroup } from "@cdktn/provider-aws/lib/lb-target-group";
import { SecurityGroup } from "@cdktn/provider-aws/lib/security-group";
import { Vpc as AwsVpc } from "@cdktn/provider-aws/lib/vpc";
import { LoadBalancerDnsInfo } from "../common";

// Types of the AWS cloud module (clouds/aws).

// AWS VPC resources interface
export interface AwsVpcResources {
  vpc: AwsVpc;
  subnets: Subnet[];
  subnetsByName: Record<string, Subnet>;
  securityGroups: SecurityGroup[];
  securityGroupsByName?: Record<string, SecurityGroup>;
  /** Security group name -> security group ID */
  securityGroupMapping: Record<string, string>;
  publicRouteTable: RouteTable;
  privateRouteTable: RouteTable;
  ec2InstanceConnectEndpoint?: Ec2InstanceConnectEndpoint;
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

// AWS Application Load Balancer output resources
export interface AwsAlbResources {
  alb: Lb;
  targetGroups: Record<string, LbTargetGroup>; // Key is the logical name from config
  listener: LbListener; // Primary listener (backward compatibility)
  listeners: Record<string, LbListener>; // All listeners keyed by logical name (e.g., "production-listener", "test-listener")
  namedListenerRules: Record<string, LbListenerRule>; // Catch-all Listener Rules keyed by listener name (Rule ARN required by ECS Blue/Green advancedConfiguration)
}

// AWS Certificate configuration
export interface AwsCertificateConfig {
  enabled: boolean;
  domains: string[]; // e.g., ["*.awstest.tohonokai.com", "awstest.tohonokai.com"]
  validationZone: string; // Zone name for DNS validation
}

// Extended AWS ALB resources with DNS info
export interface AwsAlbResourcesWithDns extends AwsAlbResources {
  dnsInfo: LoadBalancerDnsInfo;
  certificateArn?: string; // ARN of the created certificate
}

/**
 * Output returned by createAwsResources().
 * All AWS resources (VPC → PublicZone → EFS → RDS/Aurora → EC2 → ACM → ALB+ECS → DNS A-records)
 */
export interface AwsResourcesOutput {
  /** VPC resources – passed to VPN and Private Zone orchestrators */
  vpc?: AwsVpcResources;
  /** RDS / Aurora resources for Private Zone CNAME registration */
  dbResources?: AwsDbResources;
  /** EFS instance metadata for Private Zone CNAME registration */
  efsInstances?: Array<{
    cnameRecordName: string;
    dnsFqdn: string;
  }>;
  /** ALB resources with DNS info (A-record registration happens inside the orchestrator) */
  lbs?: AwsAlbResourcesWithDns[];
  /**
   * CloudWatch Logs construct created up-front, exposed so that
   * cross-cloud orchestrators (e.g. vpnResources.ts) can look up
   * already-created Log Group ARNs by name instead of creating their own.
   */
  cloudwatchResources?: {
    createdLogGroups: Record<string, { arn: string; name: string }>;
  };
  /**
   * IAM construct created up-front, exposed so that cross-cloud
   * orchestrators can look up already-created Role ARNs by name.
   */
  iamResources?: {
    createdRoles: Record<string, { arn: string; name: string }>;
  };
}
