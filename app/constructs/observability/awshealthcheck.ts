import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Route53HealthCheck } from "@cdktn/provider-aws/lib/route53-health-check";
import { Construct } from "constructs";

/**
 * Route 53 health check of an HTTP(S) endpoint (checked from several AWS
 * locations on the internet). Its metric `HealthCheckStatus` (namespace
 * AWS/Route53, dimension HealthCheckId; 1 healthy, 0 unhealthy) exists only
 * in us-east-1, so alarms on it must be created there.
 */
export interface AwsRoute53HealthCheckParams {
  /** Construct ID key (Terraform address) */
  key: string;
  /** Name tag shown in the Route 53 console */
  name: string;
  /** Host name checked (also sent as the Host header) */
  fqdn: string;
  https: boolean;
  /** Path checked, e.g. "/readyz" */
  resourcePath: string;
  /** Seconds between checks: 30 (standard) or 10 (fast, charged more) */
  requestInterval: number;
  /** Consecutive failures (or successes) before the status changes */
  failureThreshold: number;
  tags?: { [key: string]: string };
}

export function createAwsRoute53HealthCheck(
  scope: Construct,
  provider: AwsProvider,
  params: AwsRoute53HealthCheckParams,
): Route53HealthCheck {
  return new Route53HealthCheck(scope, `route53-health-check-${params.key}`, {
    provider,
    type: params.https ? "HTTPS" : "HTTP",
    fqdn: params.fqdn,
    port: params.https ? 443 : 80,
    resourcePath: params.resourcePath,
    requestInterval: params.requestInterval,
    failureThreshold: params.failureThreshold,
    tags: { ...params.tags, Name: params.name },
  });
}
