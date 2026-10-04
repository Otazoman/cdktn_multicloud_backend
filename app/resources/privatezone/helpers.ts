import { AwsVpcResources } from "../../clouds/aws/types";

// Shared helpers for the per-cloud private DNS modules in this directory.

/**
 * Helper: normalizes a Google inbound IPs value (which may be a plain
 * array or a Terraform Token-wrapped list) into a boolean indicating
 * whether it actually contains at least one address.
 *
 * IMPORTANT: an empty array ([]) is truthy in JS/TS, so callers must NOT
 * rely on a plain `if (googleInboundIps)` check - that would incorrectly
 * treat "Google side not created yet" the same as "Google IPs available",
 * and go on to create a FORWARD-type Route53 Resolver Rule / Azure
 * forwarding rule with no target IPs, which the respective cloud provider
 * rejects at apply time.
 */
export const hasGoogleInboundIps = (googleInboundIps: any): boolean =>
  Array.isArray(googleInboundIps)
    ? googleInboundIps.length > 0
    : !!googleInboundIps;

/**
 * Helper to get subnet IDs for AWS Route53 Resolver
 */
export const getAwsResolverSubnetIds = (
  awsVpcResources: AwsVpcResources,
): string[] => {
  let subnetIds: string[] = [];
  if (
    awsVpcResources.subnetsByName &&
    Object.keys(awsVpcResources.subnetsByName).length > 0
  ) {
    subnetIds = Object.values(awsVpcResources.subnetsByName)
      .map((s: any) => s.id)
      .filter(Boolean);
    console.log("Using subnetsByName for Route53 Resolver");
  } else if (
    awsVpcResources.subnets &&
    Array.isArray(awsVpcResources.subnets) &&
    awsVpcResources.subnets.length > 0
  ) {
    subnetIds = awsVpcResources.subnets.map((s: any) => s.id).filter(Boolean);
    console.log("Using subnets array for Route53 Resolver");
  }
  return subnetIds.slice(0, 2);
};

/**
 * Helper to get security group ID for AWS Route53 Resolver
 */
export const getAwsResolverSecurityGroupId = (
  awsVpcResources: AwsVpcResources,
  sgName: string,
): string | undefined => {
  if (awsVpcResources.securityGroupsByName) {
    const sg = awsVpcResources.securityGroupsByName[sgName];
    if (sg) return sg.id;
  }
  console.error(`Security group ${sgName} not found`);
  return undefined;
};
