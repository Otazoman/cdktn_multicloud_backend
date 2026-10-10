import { Route53Record } from "@cdktn/provider-aws/lib/route53-record";
import * as fs from "fs";

import {
  albConfigs,
  awsEcsClusterSettings,
  awsEcsConfigs,
} from "../../config/aws/awssettings";
import { isFeatureEnabled } from "../../config/features";
import { createAwsCertificate } from "../../constructs/certificates/awsacm";
import {
  AutoScalingConfig,
  createAwsEcsFargateResources,
} from "../../constructs/container/awsecs";
import { createAwsAlbResources } from "../../constructs/loadbalancer/awsalb";
import { AwsAlbResourcesWithDns } from "./types";
import { LoadBalancerDnsInfo } from "../common";

import { addTerraformDependency } from "../../utils/terraformDependency";
import { AwsBuildContext } from "./context";

/** 6-7. ACM certificates, ALB, ECS and DNS A-records (feature: containers) */
export function createAwsContainers(ctx: AwsBuildContext): void {
  const { scope, awsProvider, output, awsVpcResources, iamResources, publicZones, getSecurityGroupId, getIamRoleArn, getLogGroup } = ctx;

  // ──────────────────────────────────────────────
  // 6. ACM Certificate + ALB + ECS
  // ──────────────────────────────────────────────
  if (isFeatureEnabled("aws", "containers") && albConfigs) {
    const awsAlbs: AwsAlbResourcesWithDns[] = albConfigs
      .filter((config) => config.build)
      .map((config) => {
        let certificateArn: string | undefined;

        if (
          config.certificateConfig &&
          config.certificateConfig.enabled &&
          config.certificateConfig.domains?.length > 0
        ) {
          const certConfig = config.certificateConfig;

          if (certConfig.mode === "IMPORT") {
            const certPath = certConfig.certificatePath;
            const keyPath = certConfig.privateKeyPath;

            if (!certPath || !keyPath) {
              console.warn(
                `⚠️  Warning: Certificate paths not specified for ${config.name}.`,
              );
            } else if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
              console.warn(
                `⚠️  Warning: Certificate files not found for ${config.name}.`,
              );
            } else {
              const certResult = createAwsCertificate(scope, awsProvider, {
                name: `${config.name}-cert`,
                key: `${config.key ?? config.name}-cert`,
                mode: "IMPORT",
                certificatePath: certPath,
                privateKeyPath: keyPath,
                certificateChainPath: certConfig.certificateChainPath,
              });
              certificateArn = certResult.certificateArn;
            }
          } else if (certConfig.mode === "AWS_MANAGED") {
            const targetZone = publicZones[certConfig.validationZone ?? ""];

            if (!targetZone) {
              console.warn(
                `⚠️  Warning: DNS zone "${
                  certConfig.validationZone
                }" not found for ${config.name}.`,
              );
            } else {
              const certResult = createAwsCertificate(scope, awsProvider, {
                name: `${config.name}-cert`,
                key: `${config.key ?? config.name}-cert`,
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
              certificateArn,
            },
            securityGroupIds: config.securityGroupNames.map((name) =>
              getSecurityGroupId(name),
            ),
            subnetIds: config.subnetNames.map((name) => {
              const subnet = awsVpcResources.subnetsByName[name];
              if (!subnet)
                throw new Error(`Subnet ${name} not found for AWS ALB`);
              return subnet.id;
            }),
          },
          awsVpcResources.vpc.id,
        );

        addTerraformDependency(albResources.alb, awsVpcResources);
        Object.values(albResources.targetGroups).forEach((tg) =>
          addTerraformDependency(tg, awsVpcResources),
        );

        const dnsInfo: LoadBalancerDnsInfo = {
          subdomain: config.dnsConfig?.subdomain || "",
          fqdn: config.dnsConfig?.fqdn,
          dnsName: albResources.alb.dnsName,
        };

        return { ...albResources, dnsInfo, certificateArn };
      });

    // ECS (ALB ARNs now available)
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

            const listenerName = config.listenerName as
              | string
              | undefined;
            const testListenerName = config.testListenerName as
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

          const isBlueGreen = config.deploymentStrategy === "BLUE_GREEN";

          // Resolve IAM roles and CloudWatch Log Group directly from the
          // names configured in ecs.ts, instead of hardcoded role names.
          const executionRoleArn = getIamRoleArn(
            config.executionRoleName,
            `ECS service "${config.name}" (executionRoleName)`,
          );
          const taskRoleArn = getIamRoleArn(
            config.taskRoleName,
            `ECS service "${config.name}" (taskRoleName)`,
          );
          const infraRoleArn = isBlueGreen
            ? getIamRoleArn(
                // Missing name: getIamRoleArn throws "not found"
                config.infraRoleName ?? "",
                `ECS service "${config.name}" (infraRoleName)`,
              )
            : undefined;

          // ALBRequestCountPerTarget needs "<ALB ARN suffix>/<TG ARN suffix>".
          // Blue/green switches traffic between two target groups, so the
          // metric of one group drops to zero after each deployment.
          const autoScaling: AutoScalingConfig | undefined = config.autoScaling;
          let requestCountResourceLabel: string | undefined;
          if (autoScaling?.enabled && autoScaling.requestCountPerTarget) {
            if (isBlueGreen) {
              throw new Error(
                `ECS service "${config.name}": autoScaling.requestCountPerTarget is only ` +
                  `supported with the ROLLING deployment strategy.`,
              );
            }
            const albRes = awsAlbs.find(
              (res) => config.targetGroupName && res.targetGroups[config.targetGroupName],
            );
            if (!albRes || !config.targetGroupName) {
              throw new Error(
                `ECS service "${config.name}": autoScaling.requestCountPerTarget needs the ` +
                  `target group "${config.targetGroupName}" of an ALB in config/aws/alb.ts.`,
              );
            }
            requestCountResourceLabel = `${albRes.alb.arnSuffix}/${albRes.targetGroups[config.targetGroupName].arnSuffix}`;
          }

          const logGroupName = config.cloudwatchLogGroupName as string;
          const logGroup = getLogGroup(
            logGroupName,
            `ECS service "${config.name}" (cloudwatchLogGroupName)`,
          );

          const ecs = createAwsEcsFargateResources(scope, awsProvider, {
            ...config,
            securityGroupIds: config.securityGroupNames.map(
              (name) => awsVpcResources.securityGroupMapping[name],
            ),
            subnetIds: config.subnetNames.map(
              (name) => awsVpcResources.subnetsByName[name].id,
            ),
            containerConfig: {
              name: config.containerName,
              image: config.image,
              cpu: parseInt(config.cpu),
              memory: parseInt(config.memory),
              containerPort: config.port,
              hostPort: config.port,
              environment: config.environment,
            },
            targetGroupArn,
            targetGroupArnGreen,
            listenerArn,
            testListenerArn,
            productionListenerRuleArn,
            testListenerRuleArn,
            // IAM roles resolved from ecs.ts role names above
            executionRoleArn,
            taskRoleArn,
            infraRoleArn,
            // CloudWatch Log Group resolved from ecs.ts above
            cloudwatchLogGroupName: logGroupName,
            containerInsights:
              awsEcsClusterSettings[config.clusterName]?.containerInsights,
            requestCountResourceLabel,
          });

          addTerraformDependency(ecs.service, awsVpcResources.vpc);
          addTerraformDependency(ecs.taskDefinition, iamResources);
          addTerraformDependency(ecs.taskDefinition, logGroup);
        });
    }

    output.lbs = awsAlbs;

    // ──────────────────────────────────────────────
    // 7. DNS A-records (ALB alias records)
    // ──────────────────────────────────────────────
    if (isFeatureEnabled("aws", "dns")) {
      awsAlbs.forEach((alb, index) => {
        const zone = publicZones[alb.dnsInfo.subdomain];
        if (zone) {
          new Route53Record(scope, `aws-a-rec-${index}`, {
            provider: awsProvider,
            zoneId: zone.zoneId,
            name: alb.dnsInfo.fqdn || alb.dnsInfo.subdomain,
            type: "A",
            alias: {
              name: alb.alb.dnsName,
              zoneId: alb.alb.zoneId,
              evaluateTargetHealth: true,
            },
          });
        }
      });
    }
  }

}
