import { CloudId } from "../config/commonsettings";
import { isFeatureEnabled } from "../config/features";

/** A built load balancer and its public DNS settings (dnsConfig) */
export interface LoadBalancerHostName {
  name: string;
  dnsConfig?: { subdomain: string; fqdn?: string };
}

const normalize = (name: string): string => name.toLowerCase().replace(/\.$/, "");

/**
 * Stops the synthesis when two built load balancers of a cloud use the same
 * host name: both would get the same A record (the synthesis would
 * otherwise fail with an unclear duplicate construct error). Checked only
 * with the cloud's public DNS (dns feature), which creates the records.
 */
export function assertUniqueLoadBalancerHostNames(
  cloud: CloudId,
  configFile: string,
  loadBalancers: LoadBalancerHostName[],
): void {
  if (!isFeatureEnabled(cloud, "dns")) return;
  const owners = new Map<string, string>();
  for (const lb of loadBalancers) {
    const host = lb.dnsConfig?.fqdn || lb.dnsConfig?.subdomain;
    if (!host) continue;
    const key = normalize(host);
    const owner = owners.get(key);
    if (owner) {
      throw new Error(
        `${cloud}: load balancers "${owner}" and "${lb.name}" both use the host name "${key}" ` +
          `(the same A record). Build only one of them (build: false in ${configFile}).`,
      );
    }
    owners.set(key, lb.name);
  }
}

/**
 * Stops the synthesis when two clouds have a public zone of the same name:
 * both would get the same NS record in the parent zone.
 */
export function assertUniquePublicZoneNames(
  zones: Array<{ cloud: CloudId; domain: string }>,
): void {
  const owners = new Map<string, CloudId>();
  for (const { cloud, domain } of zones) {
    const key = normalize(domain);
    const owner = owners.get(key);
    if (owner) {
      throw new Error(
        `The public zone "${key}" is used by both ${owner} and ${cloud} (the same NS record in ` +
          `the parent zone). Give each cloud its own PUBLIC_DOMAIN (config/<cloud>/common.ts).`,
      );
    }
    owners.set(key, cloud);
  }
}
