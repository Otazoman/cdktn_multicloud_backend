import { Lb } from "@cdktn/provider-aws/lib/lb";
import { LbListener } from "@cdktn/provider-aws/lib/lb-listener";
import { LbListenerRule } from "@cdktn/provider-aws/lib/lb-listener-rule";
import { LbTargetGroup } from "@cdktn/provider-aws/lib/lb-target-group";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Construct } from "constructs";

/**
 * Configuration for ALB Actions (forward, fixed-response, redirect)
 */
export interface AlbActionConfig {
  type: "forward" | "fixed-response" | "redirect";
  targetGroupName?: string;
  fixedResponse?: {
    contentType: string;
    messageBody: string;
    statusCode: string;
  };
  redirect?: {
    port?: string;
    protocol?: string;
    statusCode: string;
    path?: string;
    query?: string;
  };
}

/**
 * Configuration for Listener Rule Conditions
 */
export interface AlbRuleConditionConfig {
  pathPatterns?: string[];
  hostHeaders?: string[];
  httpHeaders?: { name: string; values: string[] }[];
}

/**
 * Configuration for Listener Rules
 */
export interface AlbRuleConfig {
  priority: number;
  conditions: AlbRuleConditionConfig;
  action: AlbActionConfig;
}

/**
 * Configuration for Target Groups
 */
export interface AlbTargetGroupConfig {
  name: string;
  port: number;
  protocol: string;
  targetType: string; // Passed as a string (e.g., "ip", "instance")
  healthCheckPath: string;
}

/**
 * Configuration for the Listener
 */
export interface AlbListenerConfig {
  name?: string; // Logical name for identifying the listener (e.g., "production-listener", "test-listener")
  port: number;
  protocol: string;
  sslPolicy?: string;
  certificateArn?: string;
  defaultAction: AlbActionConfig;
}

export interface AlbConfig {
  name: string;
  internal: boolean;
  securityGroupIds: string[]; // Resolved IDs are passed here
  subnetIds: string[]; // Resolved IDs are passed here
  listenerConfig: AlbListenerConfig;
  additionalListeners?: AlbListenerConfig[]; // Optional additional listeners (e.g., HTTP redirect)
  targetGroups: AlbTargetGroupConfig[];
  listenerRules: AlbRuleConfig[];
  tags?: { [key: string]: string };
}

/**
 * Helper to build ALB Action blocks for both Listeners and Rules
 */
function buildAction(
  actionConfig: AlbActionConfig,
  targetGroups: Record<string, LbTargetGroup>,
) {
  if (actionConfig.type === "forward") {
    return {
      type: "forward",
      targetGroupArn: targetGroups[actionConfig.targetGroupName!].arn,
    };
  } else if (actionConfig.type === "fixed-response") {
    return {
      type: "fixed-response",
      fixedResponse: actionConfig.fixedResponse,
    };
  } else if (actionConfig.type === "redirect") {
    return {
      type: "redirect",
      redirect: actionConfig.redirect,
    };
  }
  throw new Error(`Unsupported action type: ${actionConfig.type}`);
}

export function createAwsAlbResources(
  scope: Construct,
  provider: AwsProvider,
  config: AlbConfig,
  vpcId: string,
) {
  // 1. Create Load Balancer
  const alb = new Lb(scope, `alb-${config.name}`, {
    provider,
    name: config.name,
    internal: config.internal,
    loadBalancerType: "application",
    securityGroups: config.securityGroupIds,
    subnets: config.subnetIds,
    tags: config.tags,
  });

  // 2. Create Target Groups
  const targetGroups: Record<string, LbTargetGroup> = {};
  config.targetGroups.forEach((tg) => {
    targetGroups[tg.name] = new LbTargetGroup(scope, `tg-${tg.name}`, {
      provider,
      name: tg.name,
      port: tg.port,
      protocol: tg.protocol,
      targetType: tg.targetType,
      vpcId: vpcId,
      healthCheck: { path: tg.healthCheckPath },
      tags: config.tags,
    });
  });

  // 3. Create primary Listener
  const primaryListenerName = config.listenerConfig.name ?? "primary";
  const listener = new LbListener(scope, `listener-${config.name}`, {
    provider,
    loadBalancerArn: alb.arn,
    port: config.listenerConfig.port,
    protocol: config.listenerConfig.protocol,
    sslPolicy:
      config.listenerConfig.protocol === "HTTPS"
        ? config.listenerConfig.sslPolicy || "ELBSecurityPolicy-2016-08"
        : undefined,
    certificateArn: config.listenerConfig.certificateArn,
    defaultAction: [
      buildAction(config.listenerConfig.defaultAction, targetGroups),
    ],
  });

  // 3b. Create additional Listeners (e.g., HTTP redirect listener, test listener for Blue/Green)
  // All listeners are stored in a Record keyed by their logical name for easy lookup
  const listeners: Record<string, LbListener> = {
    [primaryListenerName]: listener,
  };

  // Track each listener's defaultAction config for rule creation below
  const listenerActionConfigs: Record<string, AlbActionConfig> = {
    [primaryListenerName]: config.listenerConfig.defaultAction,
  };

  if (config.additionalListeners) {
    config.additionalListeners.forEach((listenerConfig, index) => {
      const listenerName = listenerConfig.name ?? `additional-${index}`;
      const additionalListener = new LbListener(
        scope,
        `listener-${config.name}-additional-${index}`,
        {
          provider,
          loadBalancerArn: alb.arn,
          port: listenerConfig.port,
          protocol: listenerConfig.protocol,
          sslPolicy: listenerConfig.sslPolicy,
          certificateArn: listenerConfig.certificateArn,
          defaultAction: [
            buildAction(listenerConfig.defaultAction, targetGroups),
          ],
        },
      );
      listeners[listenerName] = additionalListener;
      listenerActionConfigs[listenerName] = listenerConfig.defaultAction;
    });
  }

  // 3c. Create a catch-all Listener Rule for each named "forward" listener.
  // ECS Native Blue/Green advancedConfiguration.productionListenerRule / testListenerRule
  // requires a Listener Rule ARN (not a Listener ARN). We create a priority-1 rule that
  // matches all traffic ("/*") so it can be referenced by ECS during Blue/Green deployments.
  const namedListenerRules: Record<string, LbListenerRule> = {};
  Object.entries(listeners).forEach(([name, lsnr]) => {
    const actionConfig = listenerActionConfigs[name];
    // Only create rules for forward actions (redirect/fixed-response listeners don't need it)
    if (actionConfig?.type === "forward") {
      const rule = new LbListenerRule(
        scope,
        `default-rule-${config.name}-${name}`,
        {
          provider,
          listenerArn: lsnr.arn,
          priority: 1,
          action: [buildAction(actionConfig, targetGroups)],
          condition: [{ pathPattern: { values: ["/*"] } }],
        },
      );
      namedListenerRules[name] = rule;
    }
  });

  // 4. Create additional Listener Rules from config
  config.listenerRules.forEach((rule) => {
    const conditions: any[] = [];
    if (rule.conditions.pathPatterns) {
      conditions.push({
        pathPattern: { values: rule.conditions.pathPatterns },
      });
    }
    if (rule.conditions.hostHeaders) {
      conditions.push({ hostHeader: { values: rule.conditions.hostHeaders } });
    }
    if (rule.conditions.httpHeaders) {
      rule.conditions.httpHeaders.forEach((h) => {
        conditions.push({
          httpHeader: { httpHeaderName: h.name, values: h.values },
        });
      });
    }

    new LbListenerRule(scope, `rule-${config.name}-${rule.priority}`, {
      provider,
      listenerArn: listener.arn,
      priority: rule.priority,
      action: [buildAction(rule.action, targetGroups)],
      condition: conditions,
    });
  });

  return { alb, targetGroups, listener, listeners, namedListenerRules };
}
