import { ApplicationGateway } from "@cdktn/provider-azurerm/lib/application-gateway";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { PublicIp } from "@cdktn/provider-azurerm/lib/public-ip";
import { WebApplicationFirewallPolicy } from "@cdktn/provider-azurerm/lib/web-application-firewall-policy";
import { Construct } from "constructs";
import * as fs from "fs";

/**
 * Listener configuration for different ports/protocols
 */

export interface AzureAppGwSslCertificate {
  name: string;
  data: string;
  password: string;
}

export interface AzureAppGwListenerConfig {
  name: string;
  port: number;
  protocol: "Http" | "Https";
  defaultBackendName?: string;
  sslCertificateName?: string;
  redirectToListener?: string;
}

/**
 * Backend pool and settings configuration
 */
export interface AzureAppGwBackendConfig {
  name: string;
  port: number;
  protocol: "Http" | "Https";
  requestTimeout: number;
  hostName?: string;
}

/**
 * URL Path map rule for Path-based routing
 */
export interface AzureAppGwPathRule {
  name: string;
  paths: string[];
  backendName: string;
}

/**
 * Custom WAF Rule definition
 */
export interface AzureWafCustomRule {
  name: string;
  priority: number;
  ruleType: "MatchRule";
  action: "Allow" | "Block" | "Log";
  matchConditions: {
    matchVariables: { variableName: string }[];
    operator: string;
    negationCondition?: boolean;
    matchValues: string[];
  }[];
}

/**
 * Main configuration for Azure Application Gateway
 */
export interface AzureAppGwConfig {
  name: string;
  location: string;
  resourceGroupName: string;
  build: boolean;
  useAutoscale: boolean;
  sku: {
    name: "Standard_v2" | "WAF_v2";
    tier: "Standard_v2" | "WAF_v2";
    capacity?: number;
    minCapacity?: number;
    maxCapacity?: number;
  };
  enableHttp2?: boolean;
  enableFips?: boolean;
  subnetId: string;
  listeners: AzureAppGwListenerConfig[];
  backends: AzureAppGwBackendConfig[];
  pathRules?: AzureAppGwPathRule[];
  wafConfig?: {
    enabled: boolean;
    firewallMode: "Detection" | "Prevention";
    ruleSetType?: string;
    ruleSetVersion?: string;
  };
  wafCustomRules?: AzureWafCustomRule[];
  sslCertificates?: AzureAppGwSslCertificate[];
  tags?: { [key: string]: string };
}

/**
 * Construct to create Azure Application Gateway with Multi-Listener and Custom WAF Policy support
 */
export function createAzureAppGwResources(
  scope: Construct,
  provider: AzurermProvider,
  config: AzureAppGwConfig,
) {
  // 1. Public IP creation (Standard SKU is mandatory for v2)
  const publicIp = new PublicIp(scope, `pip-${config.name}`, {
    provider,
    name: `${config.name}-pip`,
    location: config.location,
    resourceGroupName: config.resourceGroupName,
    allocationMethod: "Static",
    sku: "Standard",
    tags: config.tags,
  });

  // 2. Create WAF Policy if SKU is WAF_v2
  // Custom rules must be defined in a WebApplicationFirewallPolicy resource, not inside ApplicationGateway
  let wafPolicyId: string | undefined = undefined;

  if (config.sku.name === "WAF_v2" && config.wafConfig) {
    const wafPolicy = new WebApplicationFirewallPolicy(
      scope,
      `waf-policy-${config.name}`,
      {
        provider,
        name: `${config.name}-waf-policy`,
        location: config.location,
        resourceGroupName: config.resourceGroupName,
        policySettings: {
          enabled: config.wafConfig.enabled,
          mode: config.wafConfig.firewallMode,
        },
        managedRules: {
          managedRuleSet: [
            {
              type: config.wafConfig.ruleSetType ?? "OWASP",
              version: config.wafConfig.ruleSetVersion ?? "3.2",
            },
          ],
        },
        customRules: config.wafCustomRules?.map((rule) => ({
          name: rule.name,
          priority: rule.priority,
          ruleType: rule.ruleType,
          action: rule.action,
          matchConditions: rule.matchConditions.map((mc) => ({
            matchVariables: mc.matchVariables,
            operator: mc.operator,
            negationCondition: mc.negationCondition ?? false,
            matchValues: mc.matchValues,
          })),
        })),
        tags: config.tags,
      },
    );
    wafPolicyId = wafPolicy.id;
  }

  const frontendIpConfigName = `${config.name}-feip`;

  // 3. Define Application Gateway
  const appGw = new ApplicationGateway(scope, `appgw-${config.name}`, {
    provider,
    name: config.name,
    location: config.location,
    resourceGroupName: config.resourceGroupName,
    fipsEnabled: config.enableFips,
    enableHttp2: config.enableHttp2,
    tags: config.tags,

    // Link the external WAF Policy
    firewallPolicyId: wafPolicyId,

    sku: {
      name: config.sku.name,
      tier: config.sku.tier,
      capacity: config.useAutoscale ? undefined : config.sku.capacity,
    },

    autoscaleConfiguration: config.useAutoscale
      ? {
          minCapacity: config.sku.minCapacity ?? 1,
          maxCapacity: config.sku.maxCapacity ?? 3,
        }
      : undefined,

    // When using firewallPolicyId, the inline wafConfiguration block should be undefined
    wafConfiguration: undefined,

    gatewayIpConfiguration: [
      {
        name: `${config.name}-gw-ip-config`,
        subnetId: config.subnetId,
      },
    ],

    frontendPort: config.listeners.map((l) => ({
      name: `${config.name}-${l.port}-port`,
      port: l.port,
    })),

    frontendIpConfiguration: [
      {
        name: frontendIpConfigName,
        publicIpAddressId: publicIp.id,
      },
    ],

    backendAddressPool: config.backends.map((be) => ({
      name: `${be.name}-pool`,
    })),

    backendHttpSettings: config.backends.map((be) => ({
      name: `${be.name}-setting`,
      cookieBasedAffinity: "Disabled",
      port: be.port,
      protocol: be.protocol,
      requestTimeout: be.requestTimeout,
      hostName: be.hostName,
    })),

    //  SSL Certificates
    sslCertificate: config.sslCertificates?.map((cert) => {
      let base64Data: string;
      if (fs.existsSync(cert.data)) {
        const fileBuffer = fs.readFileSync(cert.data);
        base64Data = fileBuffer.toString("base64");
      } else {
        base64Data = cert.data;
      }
      return {
        name: cert.name,
        data: base64Data,
        password: cert.password,
      };
    }),

    httpListener: config.listeners.map((l) => ({
      name: `${config.name}-${l.name}-listener`,
      frontendIpConfigurationName: frontendIpConfigName,
      frontendPortName: `${config.name}-${l.port}-port`,
      protocol: l.protocol,
      sslCertificateName:
        l.protocol === "Https" ? l.sslCertificateName : undefined,
    })),

    // Redirect Configurations
    redirectConfiguration: config.listeners
      .filter((l) => l.redirectToListener)
      .map((l) => ({
        name: `${config.name}-${l.name}-to-${l.redirectToListener}-rd`,
        redirectType: "Permanent",
        targetListenerName: `${config.name}-${l.redirectToListener}-listener`,
        includePath: true,
        includeQueryString: true,
      })),

    // --- Request Routing Rules ---
    requestRoutingRule: config.listeners.map((l, index) => {
      const hasPathRules = config.pathRules && config.pathRules.length > 0;
      const isRedirect = !!l.redirectToListener;

      return {
        name: `${config.name}-${l.name}-rule`,
        ruleType: hasPathRules && !isRedirect ? "PathBasedRouting" : "Basic",
        httpListenerName: `${config.name}-${l.name}-listener`,
        priority: 10 + index,

        redirectConfigurationName: isRedirect
          ? `${config.name}-${l.name}-to-${l.redirectToListener}-rd`
          : undefined,

        urlPathMapName:
          !isRedirect && hasPathRules
            ? `${config.name}-${l.name}-map`
            : undefined,
        backendAddressPoolName:
          !isRedirect && !hasPathRules
            ? `${l.defaultBackendName}-pool`
            : undefined,
        backendHttpSettingsName:
          !isRedirect && !hasPathRules
            ? `${l.defaultBackendName}-setting`
            : undefined,
      };
    }),

    urlPathMap:
      config.pathRules && config.pathRules.length > 0
        ? config.listeners.map((l) => ({
            name: `${config.name}-${l.name}-map`,
            // Default backend from listener config if no path matches
            defaultBackendAddressPoolName: `${l.defaultBackendName}-pool`,
            defaultBackendHttpSettingsName: `${l.defaultBackendName}-setting`,
            pathRule: config.pathRules!.map((rule) => ({
              name: rule.name,
              paths: rule.paths,
              backendAddressPoolName: `${rule.backendName}-pool`,
              backendHttpSettingsName: `${rule.backendName}-setting`,
            })),
          }))
        : [],
  });

  return { appGw, publicIp };
}
