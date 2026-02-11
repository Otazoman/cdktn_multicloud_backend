import { ComputeBackendService } from "@cdktf/provider-google/lib/compute-backend-service";
import { ComputeGlobalAddress } from "@cdktf/provider-google/lib/compute-global-address";
import { ComputeGlobalForwardingRule } from "@cdktf/provider-google/lib/compute-global-forwarding-rule";
import { ComputeHealthCheck } from "@cdktf/provider-google/lib/compute-health-check";
import { ComputeTargetHttpProxy } from "@cdktf/provider-google/lib/compute-target-http-proxy";
import { ComputeUrlMap } from "@cdktf/provider-google/lib/compute-url-map";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
import { Construct } from "constructs";

/**
 * Backend configuration tailored for GCP
 * Supports Instance Groups or Network Endpoint Groups (NEG)
 */
export interface GcpBackendConfig {
  name: string;
  protocol: string;
  loadBalancingScheme: string;
  timeoutSec?: number;
  healthCheck: {
    checkIntervalSec?: number;
    timeoutSec?: number;
    requestPath: string;
    port: number;
  };
}

/**
 * URL Map Path Rule
 */
export interface GcpPathRule {
  paths: string[];
  backendName: string;
}

/**
 * High-level GCP Load Balancer configuration
 */
export interface GcpLbConfig {
  name: string;
  project: string;
  backends: GcpBackendConfig[];
  defaultBackendName: string;
  pathRules: GcpPathRule[];
  // If true, reserve a static global IP
  reserveStaticIp: boolean;
}

export function createGoogleLbResources(
  scope: Construct,
  provider: GoogleProvider,
  config: GcpLbConfig,
) {
  // 1. Reserve Global Static IP if requested
  const staticIp = config.reserveStaticIp
    ? new ComputeGlobalAddress(scope, `ip-${config.name}`, {
        provider,
        name: `${config.name}-ip`,
      })
    : undefined;

  // 2. Setup Health Checks and Backend Services
  const backendServices: Record<string, ComputeBackendService> = {};

  config.backends.forEach((be) => {
    const hc = new ComputeHealthCheck(scope, `hc-${be.name}`, {
      provider,
      name: `${be.name}-hc`,
      httpHealthCheck: {
        port: be.healthCheck.port,
        requestPath: be.healthCheck.requestPath,
      },
      checkIntervalSec: be.healthCheck.checkIntervalSec,
      timeoutSec: be.healthCheck.timeoutSec,
    });

    backendServices[be.name] = new ComputeBackendService(
      scope,
      `be-${be.name}`,
      {
        provider,
        name: be.name,
        protocol: be.protocol,
        loadBalancingScheme: be.loadBalancingScheme,
        timeoutSec: be.timeoutSec ?? 30,
        healthChecks: [hc.id],
      },
    );
  });

  // 3. URL Map: The heart of GCP Routing
  const urlMap = new ComputeUrlMap(scope, `urlmap-${config.name}`, {
    provider,
    name: config.name,
    defaultService: backendServices[config.defaultBackendName].id,
    pathMatcher: [
      {
        name: "main-path-matcher",
        defaultService: backendServices[config.defaultBackendName].id,
        pathRule: config.pathRules.map((rule) => ({
          paths: rule.paths,
          service: backendServices[rule.backendName].id,
        })),
      },
    ],
    hostRule: [
      {
        hosts: ["*"],
        pathMatcher: "main-path-matcher",
      },
    ],
  });

  // 4. Target Proxy (HTTP)
  const targetProxy = new ComputeTargetHttpProxy(
    scope,
    `proxy-${config.name}`,
    {
      provider,
      name: `${config.name}-target-proxy`,
      urlMap: urlMap.id,
    },
  );

  // 5. Global Forwarding Rule (The Entry Point)
  const forwardingRule = new ComputeGlobalForwardingRule(
    scope,
    `fw-${config.name}`,
    {
      provider,
      name: `${config.name}-fw-rule`,
      target: targetProxy.id,
      portRange: "80",
      ipAddress: staticIp?.address, // Link reserved IP if exists
      loadBalancingScheme: config.backends[0].loadBalancingScheme, // Must match backends
    },
  );

  return { forwardingRule, backendServices, urlMap, staticIp };
}
