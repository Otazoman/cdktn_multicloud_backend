import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Construct } from "constructs";
import * as fs from "fs";
import { albConfigs, awsEcsConfigs } from "../config/aws/awssettings";
import { awsToAzure, awsToGoogle } from "../config/commonsettings";
import { createAwsCertificate } from "../constructs/certificates/awsacm";
import { createAwsEcsFargateResources } from "../constructs/container/awsecs";
import { createAwsAlbResources } from "../constructs/loadbarancer/awsalb";
import {
  AwsAlbResourcesWithDns,
  AwsVpcResources,
  CreatedPublicZones,
  LoadBalancerDnsInfo,
} from "./interfaces";

export interface AwsContainerResourcesOutput {
  awsAlbs?: AwsAlbResourcesWithDns[];
}

/**
 * Creates AWS ALB first, then creates ECS Fargate services referencing
 * the ALB target group ARNs.
 *
 * Execution order (self-contained):
 *   1. ACM Certificate (optional)
 *   2. ALB + Target Groups + Listeners
 *   3. ECS Fargate Service (with targetGroupArn from ALB)
 *
 * Condition: Runs only when awsToAzure or awsToGoogle is enabled,
 * and awsVpcResources + configs are available.
 */
export const createAwsContainerResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  awsVpcResources?: AwsVpcResources,
  dnsZones?: CreatedPublicZones,
): AwsContainerResourcesOutput => {
  if (!(awsToAzure || awsToGoogle) || !awsVpcResources || !albConfigs) {
    return {};
  }

  const getAwsSecurityGroupId = (name: string): string => {
    const mapping = awsVpcResources.securityGroupMapping;
    if (mapping && typeof mapping === "object" && name in mapping) {
      const { Token } = require("cdktn");
      return Token.asString(mapping[name as keyof typeof mapping]);
    }
    return "default-security-group-id";
  };

  const getAwsSubnetId = (name: string): string => {
    const subnet = awsVpcResources.subnetsByName[name];
    if (!subnet) {
      throw new Error(`Subnet with name ${name} not found for AWS ALB`);
    }
    return subnet.id;
  };

  // --- Step 1: Create ALB resources ---
  const awsAlbs: AwsAlbResourcesWithDns[] = albConfigs
    .filter((config) => config.build)
    .map((config) => {
      let certificateArn: string | undefined;

      if (
        config.certificateConfig &&
        config.certificateConfig.enabled &&
        config.certificateConfig.domains &&
        config.certificateConfig.domains.length > 0
      ) {
        const certConfig = config.certificateConfig;

        if (certConfig.mode === "IMPORT") {
          const certPath = (certConfig as any).certificatePath;
          const keyPath = (certConfig as any).privateKeyPath;

          if (!certPath || !keyPath) {
            console.warn(
              `⚠️  Warning: Certificate paths not specified for ${config.name}.`,
            );
          } else if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
            console.warn(
              `⚠️  Warning: Certificate files not found for ${config.name}.`,
            );
            console.warn(`    Expected: ${certPath}, ${keyPath}`);
          } else {
            const certResult = createAwsCertificate(scope, awsProvider, {
              name: `${config.name}-cert`,
              mode: "IMPORT",
              certificatePath: certPath,
              privateKeyPath: keyPath,
              certificateChainPath: (certConfig as any).certificateChainPath,
            });
            certificateArn = certResult.certificateArn;
          }
        } else if (certConfig.mode === "AWS_MANAGED") {
          const targetZone =
            dnsZones?.awsZones[(certConfig as any).validationZone];

          if (!targetZone) {
            console.warn(
              `⚠️  Warning: DNS zone "${
                (certConfig as any).validationZone
              }" not found for ${config.name}.`,
            );
          } else {
            const certResult = createAwsCertificate(scope, awsProvider, {
              name: `${config.name}-cert`,
              mode: "AWS_MANAGED",
              domainName: certConfig.domains[0],
              zoneName: targetZone.name,
              subjectAlternativeNames: certConfig.domains.slice(1),
            });
            certificateArn = certResult.certificateArn;
          }
        }
      }

      const albResources = createAwsAlbResources(
        scope,
        awsProvider,
        {
          ...config,
          listenerConfig: {
            ...config.listenerConfig,
            certificateArn: certificateArn,
          },
          securityGroupIds: config.securityGroupNames.map((name) =>
            getAwsSecurityGroupId(name),
          ),
          subnetIds: config.subnetNames.map((name) => getAwsSubnetId(name)),
        } as any,
        awsVpcResources.vpc.id,
      );

      albResources.alb.node.addDependency(awsVpcResources);
      Object.values(albResources.targetGroups).forEach((tg) => {
        tg.node.addDependency(awsVpcResources);
      });

      const dnsInfo: LoadBalancerDnsInfo = {
        subdomain: config.dnsConfig?.subdomain || "",
        fqdn: config.dnsConfig?.fqdn,
        dnsName: albResources.alb.dnsName,
      };

      return { ...albResources, dnsInfo, certificateArn };
    });

  // --- Step 2: Create ECS Fargate resources (ALB ARNs are now available) ---
  if (awsEcsConfigs) {
    awsEcsConfigs
      .filter((c) => c.build)
      .forEach((config) => {
        let targetGroupArn: string | undefined;
        let targetGroupArnGreen: string | undefined;
        let listenerArn: string | undefined;
        let testListenerArn: string | undefined;
        let productionListenerRuleArn: string | undefined;
        let testListenerRuleArn: string | undefined;

        for (const albRes of awsAlbs) {
          if (
            config.targetGroupName &&
            albRes.targetGroups[config.targetGroupName]
          ) {
            targetGroupArn = albRes.targetGroups[config.targetGroupName].arn;
          }
          if (
            config.targetGroupNameGreen &&
            albRes.targetGroups[config.targetGroupNameGreen]
          ) {
            targetGroupArnGreen =
              albRes.targetGroups[config.targetGroupNameGreen].arn;
          }

          const listenerName = (config as any).listenerName as
            | string
            | undefined;
          const testListenerName = (config as any).testListenerName as
            | string
            | undefined;

          if (listenerName && albRes.listeners?.[listenerName]) {
            listenerArn = albRes.listeners[listenerName].arn;
          } else if (albRes.listener) {
            listenerArn = albRes.listener.arn;
          }

          if (testListenerName && albRes.listeners?.[testListenerName]) {
            testListenerArn = albRes.listeners[testListenerName].arn;
          }

          if (listenerName && albRes.namedListenerRules?.[listenerName]) {
            productionListenerRuleArn =
              albRes.namedListenerRules[listenerName].arn;
          }

          if (
            testListenerName &&
            albRes.namedListenerRules?.[testListenerName]
          ) {
            testListenerRuleArn =
              albRes.namedListenerRules[testListenerName].arn;
          }
        }

        const ecs = createAwsEcsFargateResources(scope, awsProvider, {
          ...config,
          securityGroupIds: config.securityGroupNames.map(
            (name) => awsVpcResources.securityGroupMapping[name] as any,
          ),
          subnetIds: config.subnetNames.map(
            (name) => awsVpcResources.subnetsByName[name].id,
          ),
          containerConfig: {
            name: config.containerName,
            image: config.image,
            cpu: parseInt(config.cpu),
            memory: parseInt(config.memory),
            containerPort: (config as any).port,
            hostPort: (config as any).port,
            environment: (config as any).environment,
          },
          targetGroupArn,
          targetGroupArnGreen,
          listenerArn,
          testListenerArn,
          productionListenerRuleArn,
          testListenerRuleArn,
        });

        ecs.service.node.addDependency(awsVpcResources.vpc);
      });
  }

  return { awsAlbs };
};
