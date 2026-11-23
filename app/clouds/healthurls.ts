import { Lazy, TerraformOutput, TerraformStack } from "cdktn";
import { Construct } from "constructs";
import { CloudId } from "../config/commonsettings";
import { isFeatureEnabled } from "../config/features";
import { API_LIVENESS_PATH } from "./apicontainer";

// The API's health check URL behind each load balancer that is built, per
// stack: printed after the deploy (output api-health-urls; cdktn output)
const urlsByStack = new WeakMap<TerraformStack, Record<string, string>>();

/** A load balancer in front of the API (for the uptime checks) */
export interface ApiHealthTarget {
  lbName: string;
  https: boolean;
  /** FQDN when the cloud's public DNS (dns feature) is on, else the address */
  address: string;
}
const targetsByStack = new WeakMap<TerraformStack, Partial<Record<CloudId, ApiHealthTarget[]>>>();

/** The load balancers recorded by addApiHealthUrl for `cloud` (built ones only) */
export function apiHealthTargets(scope: Construct, cloud: CloudId): ApiHealthTarget[] {
  return targetsByStack.get(TerraformStack.of(scope))?.[cloud] ?? [];
}

/**
 * Records the health check URL of a load balancer. `host` is the load
 * balancer's address (ALB DNS name, IP); its FQDN is used instead when the
 * cloud's public DNS (dns feature) is on.
 */
export function addApiHealthUrl(
  scope: Construct,
  cloud: CloudId,
  lbName: string,
  https: boolean,
  host: string,
  fqdn?: string,
): void {
  const stack = TerraformStack.of(scope);
  let urls = urlsByStack.get(stack);
  if (!urls) {
    urls = {};
    urlsByStack.set(stack, urls);
    new TerraformOutput(stack, "api-health-urls", {
      description: "Health check URL of the API behind each load balancer",
      value: Lazy.anyValue({ produce: () => urlsByStack.get(stack) }),
    });
  }
  const address = isFeatureEnabled(cloud, "dns") && fqdn ? fqdn : host;
  urls[`${cloud}:${lbName}`] = `${https ? "https" : "http"}://${address}${API_LIVENESS_PATH}`;

  let targets = targetsByStack.get(stack);
  if (!targets) {
    targets = {};
    targetsByStack.set(stack, targets);
  }
  (targets[cloud] ??= []).push({ lbName, https, address });
}
