import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { Route53Record } from "@cdktf/provider-aws/lib/route53-record";
import { Route53ResolverEndpoint } from "@cdktf/provider-aws/lib/route53-resolver-endpoint";
import { Route53ResolverRule } from "@cdktf/provider-aws/lib/route53-resolver-rule";
import { Route53ResolverRuleAssociation } from "@cdktf/provider-aws/lib/route53-resolver-rule-association";
import { Route53Zone } from "@cdktf/provider-aws/lib/route53-zone";
import { TerraformIterator, Token } from "cdktf";
import { Construct } from "constructs";

export interface AwsPrivateZoneParams {
  vpcIds: string[]; // VPC IDs to associate the private hosted zones with
  createMysqlZone?: boolean;
  createPostgresZone?: boolean;
  // Optional: For conditional forwarding to Azure DNS
  azureDnsResolverIps?: string[]; // Azure DNS Private Resolver inbound endpoint IPs
  // Optional: For conditional forwarding to Google DNS
  googleDnsForwardingEnabled?: boolean; // Enable Google DNS forwarding support
  googleDnsIps?: string[]; // Google DNS IPs for forwarding google.inner domains
  resolverSubnetIds?: string[]; // Subnet IDs for Route53 Resolver endpoints (used for both INBOUND and OUTBOUND)
  resolverSecurityGroupIds?: string[]; // Security group IDs for Route53 Resolver endpoints
}

export function createAwsPrivateHostedZones(
  scope: Construct,
  provider: AwsProvider,
  params: AwsPrivateZoneParams,
  config: {
    enableConditionalForwarding: boolean;
    forwardingDomains: string[];
    tags: { [key: string]: string };
    outboundEndpointName?: string; // Name for the OUTBOUND endpoint
    resolverRuleNamePrefix?: string;
    privateZoneComments?: { [domain: string]: string };

    // New: Optional name for the INBOUND endpoint
    inboundEndpointName?: string;
  }
) {
  const zones: { [name: string]: Route53Zone } = {};

  // --- 1. Conditional Forwarding / Outbound Resolver Logic ---
  // Create single Outbound Endpoint if either Azure or Google DNS forwarding is enabled
  const hasAzureForwarding =
    params.azureDnsResolverIps && params.azureDnsResolverIps.length > 0;
  const hasGoogleForwarding =
    params.googleDnsIps && params.googleDnsIps.length > 0;

  if (
    config.enableConditionalForwarding &&
    (hasAzureForwarding || hasGoogleForwarding) &&
    params.resolverSubnetIds &&
    params.resolverSubnetIds.length > 0 &&
    params.resolverSecurityGroupIds &&
    params.resolverSecurityGroupIds.length > 0
  ) {
    const endpointName =
      config.outboundEndpointName || "multicloud-dns-forwarder";

    // Create single Route53 Resolver Outbound Endpoint for forwarding to multiple clouds
    const outboundEndpoint = new Route53ResolverEndpoint(
      scope,
      "multicloud-dns-outbound-resolver",
      {
        provider: provider,
        name: endpointName,
        direction: "OUTBOUND",
        securityGroupIds: params.resolverSecurityGroupIds,
        // Use up to the first two subnets for high availability
        ipAddress: params.resolverSubnetIds.slice(0, 2).map((subnetId) => ({
          subnetId: subnetId,
        })),
        tags: {
          ...config.tags,
          Name: endpointName,
        },
      }
    );

    // Create forwarding rules for each domain with appropriate target IPs
    const ruleNamePrefix = config.resolverRuleNamePrefix || "forward";
    config.forwardingDomains.forEach((domain, idx) => {
      const domainSafeName = domain.replace(/\./g, "-");
      let targetIps: any = [];
      let ruleType = "forwarding";

      // Determine target IPs based on domain
      if (domain === "google.inner" && hasGoogleForwarding) {
        // Forward google.inner to Google DNS IPs
        ruleType = "google";

        const googleIpsList = Token.asList(params.googleDnsIps![0]);
        const iterator = TerraformIterator.fromList(googleIpsList);

        targetIps = iterator.dynamic({
          ip: Token.asString(iterator.getString("address")),
          port: 53,
        });
      } else if (
        (domain.includes("azure") || domain === "azure.inner") &&
        hasAzureForwarding
      ) {
        // Forward azure.inner and Azure privatelink domains to Azure DNS
        ruleType = "azure";
        targetIps = params.azureDnsResolverIps!.map((ip) => ({
          ip: ip,
          port: 53,
        }));
      }

      // Only create rule if we have target IPs
      if (targetIps) {
        const rule = new Route53ResolverRule(
          scope,
          `${ruleType}-forwarding-rule-${idx}`,
          {
            provider: provider,
            name: `${ruleNamePrefix}-${domainSafeName}`,
            domainName: domain,
            ruleType: "FORWARD",
            resolverEndpointId: outboundEndpoint.id,
            targetIp: targetIps,
            tags: {
              ...config.tags,
              Name: `${ruleNamePrefix}-${domainSafeName}`,
              Target: ruleType,
            },
          }
        );

        // Associate the rule with each VPC
        params.vpcIds.forEach((vpcId, vpcIdx) => {
          new Route53ResolverRuleAssociation(
            scope,
            `rule-assoc-${domain.replace(/\./g, "-")}-vpc-${vpcIdx}`,
            {
              provider: provider,
              resolverRuleId: rule.id,
              vpcId: vpcId,
            }
          );
        });
      }
    });
  } else {
    // Fallback: Create local private hosted zones (original behavior)
    config.forwardingDomains.forEach((domain) => {
      const domainSafeName = domain.replace(/\./g, "-");
      const comment =
        config.privateZoneComments?.[domain] ||
        `Private hosted zone for ${domain}`;

      const zone = new Route53Zone(scope, `private-zone-${domainSafeName}`, {
        provider: provider,
        name: domain,
        comment: comment,
        vpc: params.vpcIds.map((vpcId) => ({ vpcId })),
        tags: {
          ...config.tags,
          Domain: domain,
        },
      });
      zones[domain] = zone;
    });
  }

  // --- 2. Inbound Endpoint Logic (New Addition) ---
  // Creates an Inbound Endpoint to allow external networks (e.g., On-Premises, Azure)
  // to resolve AWS Private Hosted Zones.
  let inboundEndpoint: Route53ResolverEndpoint | undefined;

  // Inbound endpoint should always be created if subnet IDs and security group IDs are available
  if (
    params.resolverSubnetIds &&
    params.resolverSubnetIds.length > 0 &&
    params.resolverSecurityGroupIds &&
    params.resolverSecurityGroupIds.length > 0
  ) {
    const inboundName =
      config.inboundEndpointName || "aws-dns-inbound-resolver";

    inboundEndpoint = new Route53ResolverEndpoint(
      scope,
      "aws-dns-inbound-resolver",
      {
        provider: provider,
        name: inboundName,
        direction: "INBOUND",
        securityGroupIds: params.resolverSecurityGroupIds,
        // Use up to the first two subnets for high availability
        ipAddress: params.resolverSubnetIds.slice(0, 2).map((subnetId) => ({
          subnetId: subnetId,
        })),
        tags: {
          ...config.tags,
          Name: inboundName,
        },
      }
    );
  }

  return {
    zones,
    inboundEndpoint,
  };
}

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
 * Creates CNAME records for RDS endpoints to provide short, easy-to-remember names
 */
export function createAwsRdsCnameRecords(
  scope: Construct,
  provider: AwsProvider,
  vpcIds: string[],
  zoneName: string,
  zoneComment: string,
  zoneTags: { [key: string]: string },
  rdsCnameRecords: Array<{
    shortName: string;
    rdsEndpoint: string;
    zoneName?: string;
  }>
) {
  const records: Route53Record[] = [];

  if (!rdsCnameRecords || rdsCnameRecords.length === 0) {
    return records;
  }

  // Create a private hosted zone for internal DNS names
  const internalZone = new Route53Zone(scope, "rds-internal-zone", {
    provider: provider,
    name: zoneName,
    comment: zoneComment,
    vpc: vpcIds.map((vpcId) => ({ vpcId })),
    tags: zoneTags,
  });

  // Create CNAME records for each RDS endpoint
  rdsCnameRecords.forEach((record, index) => {
    const cnameRecord = new Route53Record(scope, `rds-cname-${index}`, {
      provider: provider,
      zoneId: internalZone.zoneId,
      name: record.shortName,
      type: "CNAME",
      ttl: 300,
      records: [record.rdsEndpoint],
    });
    records.push(cnameRecord);
  });

  return records;
}
