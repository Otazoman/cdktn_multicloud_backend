import { LOCATION, RESOURCE_GROUP } from "./common";

export const azurePrivateZoneParams = {
  resourceGroup: RESOURCE_GROUP,
  location: LOCATION,
  // Inbound endpoint subnet configuration
  dnsResolverInboundSubnetCidr: "10.2.120.0/28",
  dnsResolverInboundSubnetName: "dns-resolver-inbound-subnet",
  // Outbound endpoint subnet configuration
  dnsResolverOutboundSubnetCidr: "10.2.121.0/28",
  dnsResolverOutboundSubnetName: "dns-resolver-outbound-subnet",
  dnsPrivateResolverName: "azure-private-dns-resolver",
  inboundEndpointName: "azure-resolver-inbound",
  outboundEndpointName: "azure-resolver-outbound",

  // DNS Forwarding Ruleset configuration
  forwardingRulesetName: "azure-forwarding-ruleset",
  forwardingRules: [
    {
      name: "aws-rds-forward",
      domainName: "db.internal.",
      enabled: true,
      target: "aws",
    },
    {
      name: "google-cloudsql-forward",
      domainName: "cloudsql.internal.",
      enabled: true,
      target: "google",
    },
  ],

  tags: {
    purpose: "dns-forwarding-for-aws-gcp",
    environment: "multicloud",
    managedBy: "cdktf",
  },
};
