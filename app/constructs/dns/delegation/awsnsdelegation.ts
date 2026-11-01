import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Route53Record } from "@cdktn/provider-aws/lib/route53-record";
import { Construct } from "constructs";

import { idPart } from "../../../utils/naming";

export interface AwsNsDelegationConfig {
  /** Delegated sub-domain, e.g. "azuretest.example.com" */
  domain: string;
  /** Route 53 hosted zone ID of the parent zone */
  parentZoneId: string;
  /** Name servers of the sub-domain's zone (any cloud) */
  nameServers: string[];
  ttl: number;
}

/**
 * NS record of a sub-domain in its Route 53 parent zone. It overwrites an
 * existing record of the same name (registered by hand before), like the
 * UPSERT of the manual procedure, and is deleted on destroy.
 */
export function createAwsNsDelegation(
  scope: Construct,
  provider: AwsProvider,
  config: AwsNsDelegationConfig,
): Route53Record {
  return new Route53Record(scope, `ns-delegation-${idPart(config.domain)}`, {
    provider,
    zoneId: config.parentZoneId,
    name: config.domain,
    type: "NS",
    ttl: config.ttl,
    records: config.nameServers,
    allowOverwrite: true,
  });
}
