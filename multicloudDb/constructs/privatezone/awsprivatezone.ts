import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { Route53Record } from "@cdktf/provider-aws/lib/route53-record";
import { Route53ResolverEndpoint } from "@cdktf/provider-aws/lib/route53-resolver-endpoint";
import { Route53ResolverRule } from "@cdktf/provider-aws/lib/route53-resolver-rule";
import { Route53ResolverRuleAssociation } from "@cdktf/provider-aws/lib/route53-resolver-rule-association";
import { Route53Zone } from "@cdktf/provider-aws/lib/route53-zone";
import { Construct } from "constructs";

// Forwarding rule definition
export interface ForwardingRule {
  domain: string;
  targetIps: Array<{ ip: string; port: number }> | any; // Supports dynamic blocks
  ruleType: "azure" | "google" | "generic";
}

/**
 * Creates AWS Private Hosted Zones
 */
export function createAwsPrivateZones(
  scope: Construct,
  provider: AwsProvider,
  vpcIds: string[],
  zones: Array<{
    domain: string;
    comment: string;
  }>,
  tags: { [key: string]: string }
): { [domain: string]: Route53Zone } {
  const createdZones: { [domain: string]: Route53Zone } = {};

  zones.forEach((zoneConfig) => {
    const domainSafeName = zoneConfig.domain.replace(/\./g, "-");
    const zone = new Route53Zone(scope, `private-zone-${domainSafeName}`, {
      provider: provider,
      name: zoneConfig.domain,
      comment: zoneConfig.comment,
      vpc: vpcIds.map((vpcId) => ({ vpcId })),
      tags: {
        ...tags,
        Domain: zoneConfig.domain,
      },
    });
    createdZones[zoneConfig.domain] = zone;
  });

  return createdZones;
}

/**
 * Creates AWS Route53 Resolver Inbound Endpoint
 */
export function createAwsInboundEndpoint(
  scope: Construct,
  provider: AwsProvider,
  config: {
    endpointName: string;
    resolverSubnetIds: string[];
    resolverSecurityGroupIds: string[];
    tags: { [key: string]: string };
  }
): Route53ResolverEndpoint {
  return new Route53ResolverEndpoint(scope, "aws-dns-inbound-resolver", {
    provider: provider,
    name: config.endpointName,
    direction: "INBOUND",
    securityGroupIds: config.resolverSecurityGroupIds,
    ipAddress: config.resolverSubnetIds.slice(0, 2).map((subnetId) => ({
      subnetId: subnetId,
    })),
    tags: {
      ...config.tags,
      Name: config.endpointName,
    },
  });
}

/**
 * Creates AWS Route53 Resolver Outbound Endpoint with Forwarding Rules
 */
export function createAwsOutboundEndpointWithRules(
  scope: Construct,
  provider: AwsProvider,
  config: {
    vpcIds: string[];
    forwardingRules: ForwardingRule[];
    resolverSubnetIds: string[];
    resolverSecurityGroupIds: string[];
    endpointName: string;
    ruleNamePrefix?: string;
    tags: { [key: string]: string };
  }
) {
  // Create Outbound Endpoint
  const outboundEndpoint = new Route53ResolverEndpoint(
    scope,
    "multicloud-dns-outbound-resolver",
    {
      provider: provider,
      name: config.endpointName,
      direction: "OUTBOUND",
      securityGroupIds: config.resolverSecurityGroupIds,
      ipAddress: config.resolverSubnetIds.slice(0, 2).map((subnetId) => ({
        subnetId: subnetId,
      })),
      tags: {
        ...config.tags,
        Name: config.endpointName,
      },
    }
  );

  const ruleNamePrefix = config.ruleNamePrefix || "forward";
  const createdRules: Route53ResolverRule[] = [];

  // Create forwarding rules
  config.forwardingRules.forEach((rule, idx) => {
    const domainSafeName = rule.domain.replace(/\./g, "-");

    const resolverRule = new Route53ResolverRule(
      scope,
      `${rule.ruleType}-forwarding-rule-${idx}`,
      {
        provider: provider,
        name: `${ruleNamePrefix}-${domainSafeName}`,
        domainName: rule.domain,
        ruleType: "FORWARD",
        resolverEndpointId: outboundEndpoint.id,
        targetIp: rule.targetIps,
        tags: {
          ...config.tags,
          Name: `${ruleNamePrefix}-${domainSafeName}`,
          Target: rule.ruleType,
        },
      }
    );

    createdRules.push(resolverRule);

    // Associate the rule with each VPC
    config.vpcIds.forEach((vpcId, vpcIdx) => {
      new Route53ResolverRuleAssociation(
        scope,
        `rule-assoc-${domainSafeName}-vpc-${vpcIdx}`,
        {
          provider: provider,
          resolverRuleId: resolverRule.id,
          vpcId: vpcId,
        }
      );
    });
  });

  return {
    outboundEndpoint,
    rules: createdRules,
  };
}

/**
 * Creates CNAME records in a Route53 zone
 */
export function createAwsCnameRecords(
  scope: Construct,
  provider: AwsProvider,
  zone: Route53Zone,
  records: { name: string; cname: string; ttl?: number }[]
) {
  return records.map(
    (r, idx) =>
      new Route53Record(
        scope,
        `zone-record-${idx}-${r.name.replace(/\./g, "-")}`,
        {
          provider: provider,
          zoneId: zone.zoneId,
          name: r.name,
          type: "CNAME",
          ttl: r.ttl || 300,
          records: [r.cname],
        }
      )
  );
}

/**
 * Creates CNAME records for RDS endpoints in an existing zone
 */
export function createAwsRdsCnameRecords(
  scope: Construct,
  provider: AwsProvider,
  existingZone: Route53Zone,
  rdsCnameRecords: Array<{
    shortName: string;
    rdsEndpoint: string;
  }>
) {
  const records: Route53Record[] = [];

  if (!rdsCnameRecords || rdsCnameRecords.length === 0) {
    return records;
  }

  // Create CNAME records for each RDS endpoint using the existing zone
  rdsCnameRecords.forEach((record, index) => {
    const cnameRecord = new Route53Record(scope, `rds-cname-${index}`, {
      provider: provider,
      zoneId: existingZone.zoneId,
      name: record.shortName,
      type: "CNAME",
      ttl: 300,
      records: [record.rdsEndpoint],
    });
    records.push(cnameRecord);
  });

  return records;
}
