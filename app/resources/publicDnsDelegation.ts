import { CloudContext } from "../clouds/types";
import { addTerraformDependency } from "../utils/terraformDependency";
import { PARENT_NS_TTL, parentDnsFile, parentDnsSettings } from "../config/parentdns";
import { createAwsNsDelegation } from "../constructs/dns/delegation/awsnsdelegation";

// ---------------------------------------------------------------------------
// Cross-cloud: delegation of every cloud's public DNS zone from the parent
// zone (Route 53 of another AWS account, config/parentdns.ts). Without
// state/<env>/parent-dns.json nothing is created and the NS records are
// registered by hand, as before.
// ---------------------------------------------------------------------------

export const createPublicDnsDelegation = (ctx: CloudContext): void => {
  const { scope, providers, outputs } = ctx;

  // Name servers are attribute references (known after the zones exist)
  const zones: Array<{ domain: string; nameServers: string[] }> = [
    ...Object.entries(outputs.aws.publicZones ?? {}),
    ...Object.entries(outputs.google.publicZones ?? {}),
    ...Object.entries(outputs.azure.publicZones ?? {}),
  ].map(([domain, zone]) => ({ domain, nameServers: zone.nameServers }));
  if (zones.length === 0) return;

  const parent = parentDnsSettings();
  const provider = providers.awsParentDns();
  if (!parent || !provider) {
    console.warn(
      `⚠️  ${parentDnsFile()} not found: register the NS records of ` +
        `${zones.map((z) => z.domain).join(", ")} in the parent zone by hand.`,
    );
    return;
  }

  const records = zones.map(({ domain, nameServers }) =>
    createAwsNsDelegation(scope, provider, {
      domain,
      parentZoneId: parent.hostedZoneId,
      nameServers,
      ttl: PARENT_NS_TTL,
    }),
  );
  // e.g. the Let's Encrypt issuance of the Azure Application Gateway
  addTerraformDependency(outputs.azure.needsPublicDnsDelegation, records);
};
