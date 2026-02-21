import { ComputeAddress } from "@cdktn/provider-google/lib/compute-address";
import { ComputeBackendService } from "@cdktn/provider-google/lib/compute-backend-service";
import { ComputeForwardingRule } from "@cdktn/provider-google/lib/compute-forwarding-rule";
import { ComputeGlobalAddress } from "@cdktn/provider-google/lib/compute-global-address";
import { ComputeGlobalForwardingRule } from "@cdktn/provider-google/lib/compute-global-forwarding-rule";
import { ComputeHealthCheck } from "@cdktn/provider-google/lib/compute-health-check";
import { ComputeNetwork as GoogleVpc } from "@cdktn/provider-google/lib/compute-network";
import { ComputeRegionBackendService } from "@cdktn/provider-google/lib/compute-region-backend-service";
import { ComputeRegionHealthCheck } from "@cdktn/provider-google/lib/compute-region-health-check";
import { ComputeRegionTargetHttpProxy } from "@cdktn/provider-google/lib/compute-region-target-http-proxy";
import { ComputeRegionTargetHttpsProxy } from "@cdktn/provider-google/lib/compute-region-target-https-proxy";
import { ComputeRegionUrlMap } from "@cdktn/provider-google/lib/compute-region-url-map";
import { ComputeTargetHttpProxy } from "@cdktn/provider-google/lib/compute-target-http-proxy";
import { ComputeTargetHttpsProxy } from "@cdktn/provider-google/lib/compute-target-https-proxy";
import { ComputeUrlMap } from "@cdktn/provider-google/lib/compute-url-map";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";

/* -------------------- Interfaces -------------------- */

export interface GcpBackendConfig {
  name: string;
  protocol: string;
  loadBalancingScheme: string;
  timeoutSec?: number;
  healthCheck: {
    requestPath: string;
    port: number;
  };
}

export interface GcpPathRule {
  paths: string[];
  backendName: string;
}

export interface GcpHostRule {
  hosts: string[];
  pathMatcher: string;
}

export interface GcpPathMatcher {
  name: string;
  defaultBackendName: string;
  pathRules: GcpPathRule[];
}

export interface GcpLbConfig {
  name: string;
  project: string;
  loadBalancerType: "GLOBAL" | "REGIONAL";
  region?: string;
  backends: GcpBackendConfig[];
  defaultBackendName: string;
  hostRules?: GcpHostRule[];
  pathMatchers?: GcpPathMatcher[];
  reserveStaticIp: boolean;
  protocol: "HTTP" | "HTTPS";
  port: number;
  sslCertificateNames?: string[];
  networkTier?: string;
  loadBalancingScheme?: string;
}

/* -------------------- Factory -------------------- */

export function createGoogleLbResources(
  scope: Construct,
  provider: GoogleProvider,
  config: GcpLbConfig,
  vpc: GoogleVpc,
  proxySubnet?: any,
) {
  if (config.loadBalancerType === "GLOBAL") {
    return createGlobalLb(scope, provider, config);
  }

  return createRegionalLb(scope, provider, config, vpc, proxySubnet);
}

/* =====================================================
   GLOBAL LB
===================================================== */

function createGlobalLb(
  scope: Construct,
  provider: GoogleProvider,
  config: GcpLbConfig,
) {
  /* ---------- Static IP ---------- */

  const staticIp = config.reserveStaticIp
    ? new ComputeGlobalAddress(scope, `ip-${config.name}`, {
        provider,
        name: `${config.name}-ip`,
      })
    : undefined;

  /* ---------- Backend ---------- */

  const backendServices: Record<string, ComputeBackendService> = {};

  config.backends.forEach((be) => {
    const hc = new ComputeHealthCheck(scope, `hc-${be.name}`, {
      provider,
      name: `${be.name}-hc`,
      httpHealthCheck: {
        port: be.healthCheck.port,
        requestPath: be.healthCheck.requestPath,
      },
    });

    backendServices[be.name] = new ComputeBackendService(
      scope,
      `be-${be.name}`,
      {
        provider,
        name: be.name,
        protocol: be.protocol,
        loadBalancingScheme: be.loadBalancingScheme,
        healthChecks: [hc.id],
        timeoutSec: be.timeoutSec ?? 30,
      },
    );
  });

  /* ---------- UrlMap ---------- */

  const urlMap = new ComputeUrlMap(scope, `urlmap-${config.name}`, {
    provider,
    name: config.name,
    defaultService: backendServices[config.defaultBackendName].id,
    hostRule: config.hostRules?.map((h) => ({
      hosts: h.hosts,
      pathMatcher: h.pathMatcher,
    })),
    pathMatcher: config.pathMatchers?.map((pm) => ({
      name: pm.name,
      defaultService: backendServices[pm.defaultBackendName].id,
      pathRule: pm.pathRules.map((r) => ({
        paths: r.paths,
        service: backendServices[r.backendName].id,
      })),
    })),
  });

  /* ---------- Proxy + Forwarding ---------- */

  let forwardingRule;

  if (config.protocol === "HTTPS") {
    const proxy = new ComputeTargetHttpsProxy(scope, `proxy-${config.name}`, {
      provider,
      name: `${config.name}-https-proxy`,
      urlMap: urlMap.id,
      sslCertificates: config.sslCertificateNames || [],
    });

    forwardingRule = new ComputeGlobalForwardingRule(
      scope,
      `fw-${config.name}`,
      {
        provider,
        name: `${config.name}-https-fw`,
        target: proxy.id,
        portRange: config.port.toString(),
        ipAddress: staticIp?.address,
        loadBalancingScheme: config.loadBalancingScheme,
      },
    );
  } else {
    const proxy = new ComputeTargetHttpProxy(scope, `proxy-${config.name}`, {
      provider,
      name: `${config.name}-http-proxy`,
      urlMap: urlMap.id,
    });

    forwardingRule = new ComputeGlobalForwardingRule(
      scope,
      `fw-${config.name}`,
      {
        provider,
        name: `${config.name}-http-fw`,
        target: proxy.id,
        portRange: config.port.toString(),
        ipAddress: staticIp?.address,
        loadBalancingScheme: config.loadBalancingScheme,
      },
    );
  }

  return {
    forwardingRule,
    backendServices,
    urlMap,
    staticIp,
  };
}

/* =====================================================
   REGIONAL LB
===================================================== */

function createRegionalLb(
  scope: Construct,
  provider: GoogleProvider,
  config: GcpLbConfig,
  vpc: GoogleVpc,
  proxySubnet?: any,
) {
  if (!config.region) {
    throw new Error("Regional LB requires region");
  }

  /* ---------- Static IP ---------- */

  const staticIp = config.reserveStaticIp
    ? new ComputeAddress(scope, `ip-${config.name}`, {
        provider,
        name: `${config.name}-ip`,
        region: config.region,
      })
    : undefined;

  /* ---------- Backend ---------- */

  const backendServices: Record<string, ComputeRegionBackendService> = {};

  config.backends.forEach((be) => {
    const hc = new ComputeRegionHealthCheck(scope, `hc-${be.name}`, {
      provider,
      name: `${be.name}-hc`,
      region: config.region,

      httpHealthCheck: {
        port: be.healthCheck.port,
        requestPath: be.healthCheck.requestPath,
      },
    });

    backendServices[be.name] = new ComputeRegionBackendService(
      scope,
      `be-${be.name}`,
      {
        provider,
        name: be.name,
        protocol: be.protocol,
        loadBalancingScheme: be.loadBalancingScheme,
        healthChecks: [hc.id],
        region: config.region,
      },
    );
  });

  /* ---------- UrlMap ---------- */

  const urlMap = new ComputeRegionUrlMap(scope, `urlmap-${config.name}`, {
    provider,
    name: config.name,
    region: config.region,
    defaultService: backendServices[config.defaultBackendName].id,
  });

  /* ---------- Proxy + Forwarding ---------- */

  let forwardingRule;

  if (config.protocol === "HTTPS") {
    const proxy = new ComputeRegionTargetHttpsProxy(
      scope,
      `proxy-${config.name}`,
      {
        provider,
        name: `${config.name}-https-proxy`,
        urlMap: urlMap.id,
        sslCertificates: config.sslCertificateNames || [],
        region: config.region,
      },
    );

    forwardingRule = new ComputeForwardingRule(scope, `fw-${config.name}`, {
      provider,
      name: `${config.name}-https-fw`,
      target: proxy.id,
      portRange: config.port.toString(),
      ipAddress: staticIp?.address,
      region: config.region,
      networkTier: config.networkTier,
      loadBalancingScheme: config.loadBalancingScheme,
      network: vpc.id,
      subnetwork: proxySubnet?.id,
    });
  } else {
    const proxy = new ComputeRegionTargetHttpProxy(
      scope,
      `proxy-${config.name}`,
      {
        provider,
        name: `${config.name}-http-proxy`,
        urlMap: urlMap.id,
        region: config.region,
      },
    );

    forwardingRule = new ComputeForwardingRule(scope, `fw-${config.name}`, {
      provider,
      name: `${config.name}-http-fw`,
      target: proxy.id,
      portRange: config.port.toString(),
      ipAddress: staticIp?.address,
      region: config.region,
      networkTier: config.networkTier,
      loadBalancingScheme: config.loadBalancingScheme,
      network: vpc.id,
      subnetwork: proxySubnet?.id,
    });
  }

  return {
    forwardingRule,
    backendServices,
    urlMap,
    staticIp,
  };
}
