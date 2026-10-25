import { Lazy, TerraformOutput, TerraformStack } from "cdktn";
import { Construct } from "constructs";
import { CloudId } from "../config/commonsettings";
import { isFeatureEnabled } from "../config/features";
import { API_LIVENESS_PATH } from "./apicontainer";

// The API's health check URL behind each load balancer that is built, per
// stack: printed after the deploy (output api-health-urls; cdktn output)
const urlsByStack = new WeakMap<TerraformStack, Record<string, string>>();

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
}
