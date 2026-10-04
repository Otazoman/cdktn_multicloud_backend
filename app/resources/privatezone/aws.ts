import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Route53Zone } from "@cdktn/provider-aws/lib/route53-zone";
import { TerraformIterator, Token } from "cdktn";
import { Construct } from "constructs";
import { awsPrivateZoneParams } from "../../config/aws/privatezone";
import { azurePrivateZoneParams } from "../../config/azure/privatezone";
import { resourceName } from "../../utils/naming";
import { useVpn } from "../../config/commonsettings";
import { isCloudConnected, isConnected } from "../../config/connections";
import { googlePrivateZoneParams } from "../../config/google/privatezone";
import {
  createAwsCnameRecords,
  createAwsEfsCnameRecords,
  createAwsInboundEndpoint,
  createAwsOutboundEndpointWithRules,
  createAwsPrivateZones,
  ForwardingRule,
} from "../../constructs/dns/privatezone/awsprivatezone";
import { AwsDbResources, AwsVpcResources } from "../../clouds/aws/types";
import {
  getAwsResolverSecurityGroupId,
  getAwsResolverSubnetIds,
  hasGoogleInboundIps,
} from "./helpers";

// AWS side of cross-cloud private DNS (aws.inner zone, Route 53 Resolver
// endpoints and forwarding rules to Google / Azure).

/**
 * Setup AWS Route53 Resources
 */
export const setupAwsResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  awsVpcResources: AwsVpcResources,
  azureDnsResolverIps: string[],
  googleInboundIps: any,
  awsDbResources?: AwsDbResources,
  awsEfsInstances?: Array<{ cnameRecordName: string; dnsFqdn: string }>,
) => {
  const uniqueVpcIds = [awsVpcResources.vpc.id];
  const awsOutput: any = {};
  let awsInnerZone: Route53Zone | undefined;

  // 1. Create aws.inner zone if needed
  const needsAwsInnerZone =
    isCloudConnected("aws") ||
    (awsDbResources && awsPrivateZoneParams.rdsCnameRecords?.length);

  if (needsAwsInnerZone) {
    const awsInnerZones = createAwsPrivateZones(
      scope,
      awsProvider,
      uniqueVpcIds,
      [
        {
          domain: awsPrivateZoneParams.rdsInternalZone.zoneName,
          comment: awsPrivateZoneParams.rdsInternalZone.comment,
        },
      ],
      awsPrivateZoneParams.rdsInternalZone.tags,
    );
    awsInnerZone = awsInnerZones[awsPrivateZoneParams.rdsInternalZone.zoneName];
    awsOutput.zones = awsInnerZones;
  }

  // 2. Cross-cloud DNS resources
  let awsInboundEndpointIps: string[] = [];
  if (isCloudConnected("aws") && useVpn) {
    const subnetIds = getAwsResolverSubnetIds(awsVpcResources);
    const sgId = getAwsResolverSecurityGroupId(
      awsVpcResources,
      awsPrivateZoneParams.resolverSecurityGroupName,
    );

    if (subnetIds.length > 0 && sgId) {
      const securityGroupIds = [sgId];

      // Prepare forwarding rules
      const forwardingRules: ForwardingRule[] = [];

      // See hasGoogleInboundIps() doc comment: googleInboundIps may be an
      // empty array when the Google side hasn't been created yet, and an
      // empty array is truthy, so a length-aware check is required here.
      if (
        isConnected("aws", "google") &&
        useVpn &&
        hasGoogleInboundIps(googleInboundIps)
      ) {
        const googleIpsList = Token.asList(googleInboundIps);
        const iterator = TerraformIterator.fromList(googleIpsList);
        const googleTargetIps = iterator.dynamic({
          ip: Token.asString(iterator.getString("address")),
          port: 53,
        });

        awsPrivateZoneParams.forwardingDomains
          .filter(
            (d) =>
              d === googlePrivateZoneParams.cloudSqlARecords.internalZoneName,
          )
          .forEach((domain) => {
            forwardingRules.push({
              domain,
              ruleName: awsPrivateZoneParams.resolverRuleNames[domain],
              targetIps: googleTargetIps,
              ruleType: "google",
            });
          });
      }

      if (
        isConnected("aws", "azure") &&
        useVpn &&
        azureDnsResolverIps.length > 0
      ) {
        const azureTargetIps = azureDnsResolverIps.map((ip) => ({
          ip,
          port: 53,
        }));
        awsPrivateZoneParams.forwardingDomains
          .filter(
            (d) =>
              d.includes("azure") ||
              // privatelink.file.core.windows.net does not contain "azure"
              // but must be forwarded to Azure DNS Private Resolver so that
              // AWS EC2 instances resolve the Private Endpoint IP (not the public IP).
              d.includes("windows.net") ||
              d === azurePrivateZoneParams.azureInnerDomain.zoneName,
          )
          .forEach((domain) => {
            forwardingRules.push({
              domain,
              ruleName: awsPrivateZoneParams.resolverRuleNames[domain],
              targetIps: azureTargetIps,
              ruleType: "azure",
            });
          });
      }

      // Create Inbound/Outbound Endpoints
      const inboundEndpoint = createAwsInboundEndpoint(scope, awsProvider, {
        endpointName: resourceName(
          awsPrivateZoneParams.inboundEndpointName,
          "aws",
          "resolver-inbound",
        ),
        resolverSubnetIds: subnetIds,
        resolverSecurityGroupIds: securityGroupIds,
        tags: awsPrivateZoneParams.tags,
      });
      awsOutput.inboundEndpoint = inboundEndpoint;
      awsInboundEndpointIps = [
        `\${tolist(${inboundEndpoint.fqn}.ip_address)[0].ip}`,
        `\${tolist(${inboundEndpoint.fqn}.ip_address)[1].ip}`,
      ];

      if (forwardingRules.length > 0) {
        const outboundResult = createAwsOutboundEndpointWithRules(
          scope,
          awsProvider,
          {
            vpcIds: uniqueVpcIds,
            forwardingRules,
            resolverSubnetIds: subnetIds,
            resolverSecurityGroupIds: securityGroupIds,
            endpointName: resourceName(
              awsPrivateZoneParams.outboundEndpointName,
              "aws",
              "resolver-outbound",
            ),
            tags: {
              ...awsPrivateZoneParams.tags,
              ...(isConnected("aws", "google") && {
                Purpose: "AWS-Google-DNS-Forwarding",
              }),
            },
          },
        );
        awsOutput.outboundEndpoint = outboundResult.outboundEndpoint;
        awsOutput.forwardingRules = outboundResult.rules;
      }
    }
  }

  // 3. RDS CNAME Records
  if (
    awsInnerZone &&
    awsPrivateZoneParams.rdsCnameRecords?.length &&
    awsDbResources
  ) {
    const cnameRecords = (awsPrivateZoneParams.rdsCnameRecords as any[])
      .map((record) => {
        let endpoint: string | undefined = record.rdsEndpoint;
        if (!endpoint) {
          if (record.type === "aurora") {
            endpoint = awsDbResources.auroraClusters?.find(
              (c) => c.clusterIdentifier === record.dbIdentifier,
            )?.endpoint;
          } else {
            endpoint = awsDbResources.rdsInstances?.find(
              (i) => i.identifier === record.dbIdentifier,
            )?.endpoint;
          }
        }
        return endpoint
          ? {
              name: `${record.shortName}.${awsPrivateZoneParams.rdsInternalZone.zoneName}`,
              target: endpoint,
            }
          : null;
      })
      .filter((r): r is { name: string; target: string } => r !== null);

    if (cnameRecords.length > 0) {
      awsOutput.rdsCnameRecords = createAwsCnameRecords(
        scope,
        awsProvider,
        awsInnerZone,
        cnameRecords,
      );
    }
  }

  // 4. EFS CNAME Records
  if (awsInnerZone && awsEfsInstances && awsEfsInstances.length > 0) {
    awsOutput.efsCnameRecords = createAwsEfsCnameRecords(
      scope,
      awsProvider,
      awsInnerZone,
      awsEfsInstances.map((i) => ({
        name: i.cnameRecordName,
        efsDnsName: i.dnsFqdn,
      })),
    );
  }

  return { awsOutput, awsInboundEndpointIps };
};
