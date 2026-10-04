import { DnsManagedZone } from "@cdktn/provider-google/lib/dns-managed-zone";
import { resourceName } from "../../utils/naming";
import { TerraformOutput } from "cdktn";

import { isFeatureEnabled } from "../../config/features";
import {
  gcpLbConfigs,
  gcpPublicZoneNames,
} from "../../config/google/googlesettings";
import { GoogleBuildContext } from "./context";

/** 2. Public DNS zones (feature: dns) */
export function createGooglePublicDns(ctx: GoogleBuildContext): void {
  const { scope, googleProvider, output, publicZones } = ctx;

  // ──────────────────────────────────────────────
  // 2. Public DNS Zone
  // ──────────────────────────────────────────────

  if (isFeatureEnabled("google", "dns") && gcpLbConfigs) {
    const unique = (arr: (string | undefined)[]) =>
      Array.from(new Set(arr.filter(Boolean))) as string[];

    const googleSubdomains = unique(
      gcpLbConfigs.filter((c) => c.build).map((c) => c.dnsConfig?.subdomain),
    );

    googleSubdomains.forEach((subdomain) => {
      const zoneSafeName = subdomain.replace(/\./g, "-");
      const zone = new DnsManagedZone(scope, `p-zone-gcp-${zoneSafeName}`, {
        provider: googleProvider,
        project: gcpLbConfigs[0].project,
        name: resourceName(
          gcpPublicZoneNames[subdomain],
          "google",
          "public-zone",
          zoneSafeName,
        ),
        dnsName: subdomain.endsWith(".") ? subdomain : `${subdomain}.`,
        visibility: "public",
      });
      publicZones[subdomain] = zone;
      new TerraformOutput(scope, `gcp-ns-${zoneSafeName}`, {
        value: zone.nameServers,
      });
    });

    output.publicZones = publicZones;
  }

}
