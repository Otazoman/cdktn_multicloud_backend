import { Route53Zone } from "@cdktn/provider-aws/lib/route53-zone";
import { TerraformOutput } from "cdktn";

import { albConfigs } from "../../config/aws/awssettings";
import { isFeatureEnabled } from "../../config/features";

import { AwsBuildContext } from "./context";

/** 2. Public DNS zones (feature: dns) */
export function createAwsPublicDns(ctx: AwsBuildContext): void {
  const { scope, awsProvider, publicZones } = ctx;

  // ──────────────────────────────────────────────
  // 2. Public DNS Zone
  // ──────────────────────────────────────────────

  if (isFeatureEnabled("aws", "dns") && albConfigs) {
    const unique = (arr: (string | undefined)[]) =>
      Array.from(new Set(arr.filter(Boolean))) as string[];

    const awsSubdomains = unique(
      albConfigs.filter((c) => c.build).map((c) => c.dnsConfig?.subdomain),
    );

    awsSubdomains.forEach((subdomain) => {
      const zoneSafeName = subdomain.replace(/\./g, "-");
      const zone = new Route53Zone(scope, `p-zone-aws-${zoneSafeName}`, {
        provider: awsProvider,
        name: subdomain,
        tags: { Name: subdomain },
      });
      publicZones[subdomain] = zone;
      new TerraformOutput(scope, `aws-ns-${zoneSafeName}`, {
        value: zone.nameServers,
      });
    });
  }

}
