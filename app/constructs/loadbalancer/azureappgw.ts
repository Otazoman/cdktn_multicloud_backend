import { ApplicationGateway } from "@cdktn/provider-azurerm/lib/application-gateway";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { PublicIp } from "@cdktn/provider-azurerm/lib/public-ip";
import { WebApplicationFirewallPolicy } from "@cdktn/provider-azurerm/lib/web-application-firewall-policy";
import { Construct } from "constructs";
import { resourceName } from "../../utils/naming";
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
  /** Sub-resource names. Default: <project>-azure-appgw-<kind>-<gateway>-<listener> */
  names?: {
    listener?: string;
    rule?: string;
    redirect?: string;
    urlPathMap?: string;
  };
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
  /** Sub-resource names. Default: <project>-azure-appgw-<pool|setting>-<backend> */
  names?: { pool?: string; setting?: string };
  port: number;
  protocol: "Http" | "Https";
  requestTimeout: number;
  hostName?: string;
  targetFqdns?: string[];
  pickHostNameFromBackendAddress?: boolean;
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
  /**
   * Construct ID key (Terraform address). Defaults to `name`. To rename
   * the resource without replacing it in state, set this to the old value.
   */
  key?: string;
  name: string;
  /** Resource / sub-resource names. Default: <project>-azure-appgw-<kind>-<gateway> */
  names?: {
    publicIp?: string;
    wafPolicy?: string;
    gatewayIpConfiguration?: string;
    frontendIpConfiguration?: string;
    /** Frontend port name per port number */
    frontendPorts?: Record<number, string>;
  };
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
  const names = appGwNames(config);

  // 1. Public IP creation (Standard SKU is mandatory for v2)
  const publicIp = new PublicIp(scope, `pip-${config.key ?? config.name}`, {
    provider,
    name: names.publicIp,
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
      `waf-policy-${config.key ?? config.name}`,
      {
        provider,
        name: names.wafPolicy,
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

  const frontendIpConfigName = names.frontendIpConfiguration;

  // 3. Define Application Gateway
  const appGw = new ApplicationGateway(scope, `appgw-${config.key ?? config.name}`, {
    provider,
    name: config.name,
    location: config.location,
    resourceGroupName: config.resourceGroupName,
    fipsEnabled: config.enableFips,
    http2Enabled: config.enableHttp2,
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
        name: names.gatewayIpConfiguration,
        subnetId: config.subnetId,
      },
    ],

    frontendPort: config.listeners.map((l) => ({
      name: names.frontendPort(l.port),
      port: l.port,
    })),

    frontendIpConfiguration: [
      {
        name: frontendIpConfigName,
        publicIpAddressId: publicIp.id,
      },
    ],

    backendAddressPool: config.backends.map((be) => ({
      name: names.pool(be.name),
      fqdns: be.targetFqdns,
    })),

    backendHttpSettings: config.backends.map((be) => ({
      name: names.setting(be.name),
      cookieBasedAffinity: "Disabled",
      port: be.port,
      protocol: be.protocol,
      requestTimeout: be.requestTimeout,
      hostName: be.pickHostNameFromBackendAddress
        ? undefined
        : be.hostName ?? publicIp.ipAddress,
      pickHostNameFromBackendAddress:
        be.pickHostNameFromBackendAddress ?? false,
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
      name: names.listener(l.name),
      frontendIpConfigurationName: frontendIpConfigName,
      frontendPortName: names.frontendPort(l.port),
      protocol: l.protocol,
      sslCertificateName:
        l.protocol === "Https" ? l.sslCertificateName : undefined,
    })),

    // Redirect Configurations
    redirectConfiguration: config.listeners
      .filter((l) => l.redirectToListener)
      .map((l) => ({
        name: names.redirect(l),
        redirectType: "Permanent",
        targetListenerName: names.listener(l.redirectToListener!),
        includePath: true,
        includeQueryString: true,
      })),

    // --- Request Routing Rules ---
    requestRoutingRule: config.listeners.map((l, index) => {
      const hasPathRules = config.pathRules && config.pathRules.length > 0;
      const isRedirect = !!l.redirectToListener;

      return {
        name: names.rule(l),
        ruleType: hasPathRules && !isRedirect ? "PathBasedRouting" : "Basic",
        httpListenerName: names.listener(l.name),
        priority: 10 + index,

        redirectConfigurationName: isRedirect ? names.redirect(l) : undefined,

        urlPathMapName:
          !isRedirect && hasPathRules ? names.urlPathMap(l) : undefined,
        backendAddressPoolName:
          !isRedirect && !hasPathRules
            ? names.pool(l.defaultBackendName!)
            : undefined,
        backendHttpSettingsName:
          !isRedirect && !hasPathRules
            ? names.setting(l.defaultBackendName!)
            : undefined,
      };
    }),

    urlPathMap:
      config.pathRules && config.pathRules.length > 0
        ? config.listeners.map((l) => ({
            name: names.urlPathMap(l),
            // Default backend from listener config if no path matches
            defaultBackendAddressPoolName: names.pool(l.defaultBackendName!),
            defaultBackendHttpSettingsName: names.setting(
              l.defaultBackendName!,
            ),
            pathRule: config.pathRules!.map((rule) => ({
              name: rule.name,
              paths: rule.paths,
              backendAddressPoolName: names.pool(rule.backendName),
              backendHttpSettingsName: names.setting(rule.backendName),
            })),
          }))
        : [],
  });

  return { appGw, publicIp };
}

/**
 * Names of the gateway's resources and sub-resources, from config (or the
 * default name). Sub-resources reference each other through these functions
 * (by listener / backend key), so renaming one keeps references consistent.
 */
function appGwNames(config: AzureAppGwConfig) {
  const gw = config.name;
  const name = (value: string | undefined, kind: string, key: string) =>
    resourceName(value, "azure", `appgw-${kind}`, key);
  const listenerOf = (key: string) =>
    config.listeners.find((l) => l.name === key);
  const backendOf = (key: string) =>
    config.backends.find((b) => b.name === key);

  return {
    publicIp: name(config.names?.publicIp, "pip", gw),
    wafPolicy: name(config.names?.wafPolicy, "waf-policy", gw),
    gatewayIpConfiguration: name(
      config.names?.gatewayIpConfiguration,
      "gw-ip-config",
      gw,
    ),
    frontendIpConfiguration: name(
      config.names?.frontendIpConfiguration,
      "feip",
      gw,
    ),
    frontendPort: (port: number) =>
      name(config.names?.frontendPorts?.[port], "port", `${gw}-${port}`),
    listener: (key: string) =>
      name(listenerOf(key)?.names?.listener, "listener", `${gw}-${key}`),
    rule: (l: AzureAppGwListenerConfig) =>
      name(l.names?.rule, "rule", `${gw}-${l.name}`),
    redirect: (l: AzureAppGwListenerConfig) =>
      name(l.names?.redirect, "redirect", `${gw}-${l.name}`),
    urlPathMap: (l: AzureAppGwListenerConfig) =>
      name(l.names?.urlPathMap, "url-path-map", `${gw}-${l.name}`),
    pool: (key: string) => name(backendOf(key)?.names?.pool, "pool", key),
    setting: (key: string) =>
      name(backendOf(key)?.names?.setting, "setting", key),
  };
}
