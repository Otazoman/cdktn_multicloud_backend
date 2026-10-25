import { IamRole } from "@cdktn/provider-aws/lib/iam-role";
import { IamRolePolicy } from "@cdktn/provider-aws/lib/iam-role-policy";
import { SchedulerSchedule } from "@cdktn/provider-aws/lib/scheduler-schedule";
import { Route53Record } from "@cdktn/provider-aws/lib/route53-record";
import * as fs from "fs";

import {
  albConfigs,
  awsCicdConfigs,
  awsEcsClusterSettings,
  awsEcsConfigs,
} from "../../config/aws/awssettings";
import { apiContainerConfig } from "../../config/apicontainer";
import {
  apiContainerSettings,
  apiLocalDbHost,
  JOURNAL_PRUNE_COMMAND,
  journalPruneEnvironment,
} from "../apicontainer";
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
import { addApiHealthUrl } from "../healthurls";
import { AwsBuildContext } from "./context";
import { idPart, resourceName } from "../../utils/naming";

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

        // An HTTPS listener without a certificate is rejected by AWS at
        // deploy time; warn at synth time instead.
        if (!certificateArn) {
          const httpsListeners = [config.listenerConfig, ...(config.additionalListeners ?? [])]
            .filter((l) => l.protocol === "HTTPS" && !l.certificateArn)
            .map((l) => l.name ?? `port ${l.port}`);
          if (httpsListeners.length > 0) {
            console.warn(
              `⚠️  Warning: ALB "${config.name}" has HTTPS listeners (${httpsListeners.join(", ")}) ` +
                `but no certificate (certificateConfig in config/aws/alb.ts; AWS_MANAGED needs ` +
                `features.dns). The deploy will fail: AWS requires a certificate for HTTPS listeners.`,
            );
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
      // ECS services deployed by CI/CD run the API
      const apiServiceNames = new Set(
        awsCicdConfigs
          .filter((c) => c.build && c.deployTarget)
          .map((c) => c.deployTarget.ecsServiceName),
      );
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

          // The API (config/apicontainer.ts): the ECS service CI/CD deploys
          // to, when AWS has a database. The password comes from Secrets
          // Manager, read by the execution role when a task starts.
          const api = apiServiceNames.has(config.name)
            ? apiContainerSettings(scope, "aws", () =>
                apiLocalDbHost("aws", [
                  ...(output.dbResources?.auroraClusters ?? []).map((c) => ({
                    name: c.clusterIdentifier,
                    host: c.endpoint,
                  })),
                  ...(output.dbResources?.rdsInstances ?? []).map((r) => ({
                    name: r.identifier,
                    host: r.address,
                  })),
                ]),
              )
            : undefined;
          let apiSecretPolicy: IamRolePolicy | undefined;
          let apiSecrets: { name: string; valueFrom: string }[] | undefined;
          if (api) {
            const secret = ctx.dbSecrets?.get(apiContainerConfig.passwordSecretKey);
            if (!secret) {
              throw new Error(
                `ECS service "${config.name}" (API): secret "${apiContainerConfig.passwordSecretKey}" ` +
                  `not found in config/aws/secrets.ts`,
              );
            }
            apiSecrets = api.passwordVariables.map((name) => ({
              name,
              valueFrom: secret.arn,
            }));
            apiSecretPolicy = new IamRolePolicy(
              scope,
              `ecs-api-secret-policy-${idPart(config.name)}`,
              {
                provider: awsProvider,
                name: `${config.name}-read-db-api-password`,
                role: iamResources.createdRoles[config.executionRoleName].name,
                policy: JSON.stringify({
                  Version: "2012-10-17",
                  Statement: [
                    {
                      Effect: "Allow",
                      Action: ["secretsmanager:GetSecretValue"],
                      Resource: [secret.arn],
                    },
                  ],
                }),
              },
            );
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
              environment: api
                ? [...(config.environment ?? []), ...api.environment]
                : config.environment,
              secrets: apiSecrets,
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
          if (apiSecretPolicy) {
            addTerraformDependency(ecs.service, apiSecretPolicy);
          }

          // Journal pruning job (config/apicontainer.ts journalPrune): runs
          // the latest revision of the API's task definition, which CI/CD
          // registers with each deployed image, with the command overridden.
          if (api && apiContainerConfig.journalPrune.enabled) {
            const prune = apiContainerConfig.journalPrune;
            const jobName = resourceName(prune.names.aws, "aws", "journal-prune");
            const schedulerRole = new IamRole(scope, `journal-prune-scheduler-role-${idPart(config.name)}`, {
              provider: awsProvider,
              name: `${jobName}-scheduler`,
              assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Principal: { Service: "scheduler.amazonaws.com" },
                    Action: "sts:AssumeRole",
                  },
                ],
              }),
            });
            const schedulerPolicy = new IamRolePolicy(
              scope,
              `journal-prune-scheduler-policy-${idPart(config.name)}`,
              {
                provider: awsProvider,
                name: "run-journal-prune-task",
                role: schedulerRole.name,
                policy: JSON.stringify({
                  Version: "2012-10-17",
                  Statement: [
                    {
                      Effect: "Allow",
                      Action: ["ecs:RunTask"],
                      Resource: [
                        ecs.taskDefinition.arnWithoutRevision,
                        `${ecs.taskDefinition.arnWithoutRevision}:*`,
                      ],
                    },
                    {
                      Effect: "Allow",
                      Action: ["iam:PassRole"],
                      Resource: [executionRoleArn, taskRoleArn],
                    },
                  ],
                }),
              },
            );
            const schedule = new SchedulerSchedule(scope, `journal-prune-${idPart(config.name)}`, {
              provider: awsProvider,
              name: jobName,
              scheduleExpression: prune.schedules.aws,
              scheduleExpressionTimezone: prune.timeZone,
              flexibleTimeWindow: { mode: "OFF" },
              target: {
                arn: ecs.cluster.arn,
                roleArn: schedulerRole.arn,
                retryPolicy: { maximumRetryAttempts: 2 },
                ecsParameters: {
                  // Without a revision: the latest ACTIVE revision
                  taskDefinitionArn: ecs.taskDefinition.arnWithoutRevision,
                  launchType: "FARGATE",
                  networkConfiguration: {
                    // Like the service (constructs/container/awsecs.ts)
                    assignPublicIp: false,
                    securityGroups: config.securityGroupNames.map(
                      (name) => awsVpcResources.securityGroupMapping[name],
                    ),
                    subnets: config.subnetNames.map(
                      (name) => awsVpcResources.subnetsByName[name].id,
                    ),
                  },
                },
                input: JSON.stringify({
                  containerOverrides: [
                    {
                      name: config.containerName,
                      command: JOURNAL_PRUNE_COMMAND,
                      environment: journalPruneEnvironment(),
                    },
                  ],
                }),
              },
            });
            addTerraformDependency(schedule, schedulerPolicy);
          }
        });
    }

    output.lbs = awsAlbs;
    ctx.albsByName = Object.fromEntries(
      albConfigs.filter((c) => c.build).map((c, i) => [c.name, awsAlbs[i]]),
    );
    albConfigs
      .filter((c) => c.build)
      .forEach((c, i) =>
        addApiHealthUrl(
          scope,
          "aws",
          c.name,
          c.listenerConfig.protocol === "HTTPS",
          awsAlbs[i].alb.dnsName,
          c.dnsConfig?.fqdn,
        ),
      );

    // ──────────────────────────────────────────────
    // 7. DNS A-records (ALB alias records)
    // ──────────────────────────────────────────────
    if (isFeatureEnabled("aws", "dns")) {
      awsAlbs.forEach((alb) => {
        const zone = publicZones[alb.dnsInfo.subdomain];
        if (zone) {
          new Route53Record(scope, `aws-a-rec-${idPart(alb.dnsInfo.fqdn || alb.dnsInfo.subdomain)}`, {
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
