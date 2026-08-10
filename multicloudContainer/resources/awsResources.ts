/**
 * awsResources.ts
 *
 * Single-cloud orchestrator for ALL AWS resources.
 *
 * Resource creation order (all Construct references available within one file):
 *
 *   0. CloudWatch (Groups/Filters/Alarms) & IAM Roles/Policies (First-class Foundations)
 *   1. VPC / Subnets / SGs / NAT / Route Tables
 *   2. Public DNS Zone  (useDns)
 *   3. EFS              (useStorage)
 *   4. RDS / Aurora     (useDbs)
 *   5. EC2              (useVms)
 *   6. ACM Certificate + ALB + ECS  (useContainers)
 *   7. DNS A-records    (useDns + useContainers)
 *   8. ECR + CodeBuild  (useCicd)
 */

import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Route53Record } from "@cdktn/provider-aws/lib/route53-record";
import { Route53Zone } from "@cdktn/provider-aws/lib/route53-zone";
import { TerraformOutput, Token } from "cdktn";
import { Construct } from "constructs";
import * as fs from "fs";

import {
  albConfigs,
  auroraConfigs,
  awsCicdConfigs,
  awsEcsConfigs,
  awsVpcResourcesparams,
  cloudwatchLogGroupsConfig,
  cloudwatchMetricAlarmsConfig,
  cloudwatchMetricFiltersConfig,
  ec2Configs,
  efsConfigs,
  iamPoliciesConfig,
  iamRolesConfig,
  rdsConfigs,
} from "../config/aws/awssettings";
import {
  awsToAzure,
  awsToGoogle,
  useContainers,
  useDbs,
  useDns,
  useStorage,
  useVms,
} from "../config/commonsettings";
import { createAwsCertificate } from "../constructs/certificates/awsacm";
import { createAwsEcsFargateResources } from "../constructs/container/awsecs";
import { AwsIamResources } from "../constructs/iam/awsiam";
import { createAwsAlbResources } from "../constructs/loadbarancer/awsalb";
import { AwsCloudWatchResources } from "../constructs/observability/awscloudwatch";
import {
  AwsRelationalDatabaseConfig,
  createAwsRelationalDatabases,
} from "../constructs/relationaldatabase/awsrelationaldatabase";
import { createAwsEfs } from "../constructs/storage/awsefs";
import { createAwsEc2Instances } from "../constructs/vmresources/awsec2";
import { createAwsVpcResources } from "../constructs/vpcnetwork/awsvpc";
import {
  AwsAlbResourcesWithDns,
  AwsResourcesOutput,
  AwsVpcResources,
  LoadBalancerDnsInfo,
} from "./interfaces";

import { useCicd } from "../config/commonsettings";
import { createAwsCicdResources } from "../constructs/cicd/awscicd";

// ──────────────────────────────────────────────
// Helpers (kept private to this module)
// ──────────────────────────────────────────────

const mapRdsConfigs = (): AwsRelationalDatabaseConfig[] =>
  rdsConfigs.map((config) => ({
    ...config,
    type: "rds" as const,
    masterUsername:
      typeof config.username === "string" ? config.username : undefined,
    password:
      !config.manageMasterUserPassword &&
      typeof (config as any).password === "string"
        ? (config as any).password
        : undefined,
    instanceCount: undefined,
    dbClusterParameterGroupName: undefined,
    dbClusterParameterGroupFamily: undefined,
    dbClusterParameterGroupParametersFile: undefined,
    instanceParameterGroupName: undefined,
    instanceParameterGroupFamily: undefined,
    instanceParameterGroupParametersFile: undefined,
    instancePreferredMaintenanceWindow: undefined,
  }));

const mapAuroraConfigs = (): AwsRelationalDatabaseConfig[] =>
  auroraConfigs.map((config) => ({
    ...config,
    type: "aurora" as const,
    identifier: config.clusterIdentifier,
  }));

/**
 * Creates all AWS resources in the correct dependency order.
 *
 * Conditions for each sub-section are evaluated from commonsettings.ts –
 * the config itself is never changed.
 */
export const createAwsResources = (
  scope: Construct,
  awsProvider: AwsProvider,
): AwsResourcesOutput => {
  const output: AwsResourcesOutput = {};

  if (!awsVpcResourcesparams.isEnabled) {
    return output;
  }

  // ──────────────────────────────────────────────
  // 0. CloudWatch & IAM
  //
  // Created first so that every other AWS resource below can simply
  // reference an already-existing Log Group / IAM Role instead of
  // auto-creating (and later orphaning on destroy) its own.
  // ──────────────────────────────────────────────
  const cloudwatchResources = new AwsCloudWatchResources(
    scope,
    "aws-global-cloudwatch",
    awsProvider,
    {
      logGroups: cloudwatchLogGroupsConfig,
      metricFilters: cloudwatchMetricFiltersConfig,
      metricAlarms: cloudwatchMetricAlarmsConfig,
    },
  );

  const iamResources = new AwsIamResources(
    scope,
    "aws-global-iam",
    awsProvider,
    {
      roles: iamRolesConfig,
      policies: iamPoliciesConfig,
    },
  );

  // Store references on the output so cross-cloud orchestrators (e.g.
  // vpnResources.ts) can look up already-created Log Group / Role ARNs
  // by name instead of creating their own.
  output.cloudwatchResources = cloudwatchResources;
  output.iamResources = iamResources;

  // ──────────────────────────────────────────────
  // 1. VPC
  // ──────────────────────────────────────────────
  const vpcRaw = createAwsVpcResources(
    scope,
    awsProvider,
    awsVpcResourcesparams,
  );

  const awsVpcResources: AwsVpcResources = {
    vpc: vpcRaw.vpc,
    subnets: vpcRaw.subnets,
    subnetsByName: vpcRaw.subnetsByName,
    securityGroups: vpcRaw.securityGroups,
    securityGroupsByName: vpcRaw.securityGroupsByName,
    securityGroupMapping: vpcRaw.securityGroupMapping as any,
    publicRouteTable: vpcRaw.publicRouteTable,
    privateRouteTable: vpcRaw.privateRouteTable,
    ec2InstanceConnectEndpoint: vpcRaw.ec2InstanceConnectEndpoint,
  };

  output.vpc = awsVpcResources;

  // Helper: resolve SG id by name
  const getSecurityGroupId = (name: string): string => {
    const mapping = awsVpcResources.securityGroupMapping;
    if (mapping && typeof mapping === "object" && name in mapping) {
      return Token.asString(mapping[name as keyof typeof mapping]);
    }
    console.warn(`No security group found for name: ${name}`);
    return "default-security-group-id";
  };

  // Helper: resolve an IAM Role ARN by the role name given in a config
  // file (e.g. ecs.ts / aurorards.ts / cicdsettings.ts). Throws early if
  // the referenced role name does not exist in iam.ts, so a typo in a
  // config file is caught immediately instead of silently deploying
  // without the intended role.
  const getIamRoleArn = (roleName: string, contextLabel: string): string => {
    const role = iamResources.createdRoles[roleName];
    if (!role) {
      throw new Error(
        `IAM Role "${roleName}" referenced by ${contextLabel} was not found. ` +
          `Make sure it is defined in config/aws/iam.ts (iamRolesConfig).`,
      );
    }
    return role.arn;
  };

  // Helper: resolve a CloudWatch Log Group by the name given in a config
  // file. Throws early if the referenced name does not exist in
  // cloudwatchlogs.ts, so a typo is caught immediately.
  const getLogGroup = (logGroupName: string, contextLabel: string) => {
    const logGroup = cloudwatchResources.createdLogGroups[logGroupName];
    if (!logGroup) {
      throw new Error(
        `CloudWatch Log Group "${logGroupName}" referenced by ${contextLabel} was not found. ` +
          `Make sure it is defined in config/aws/cloudwatchlogs.ts (cloudwatchLogGroupsConfig).`,
      );
    }
    return logGroup;
  };

  // ──────────────────────────────────────────────
  // 2. Public DNS Zone
  // ──────────────────────────────────────────────
  const publicZones: Record<string, Route53Zone> = {};

  if (useDns && albConfigs) {
    const unique = (arr: (string | undefined)[]) =>
      Array.from(new Set(arr.filter(Boolean))) as string[];

    const awsSubdomains = unique(
      albConfigs.filter((c) => c.build).map((c) => c.dnsConfig?.subdomain),
    );

    awsSubdomains.forEach((subdomain) => {
      const zoneSafeName = subdomain.replace(/\./g, "-");
      const zone = new Route53Zone(scope, `p-zone-aws-${zoneSafeName}`, {
        provider: awsProvider,
        name: subdomain,
        tags: { Name: subdomain },
      });
      publicZones[subdomain] = zone;
      new TerraformOutput(scope, `aws-ns-${zoneSafeName}`, {
        value: zone.nameServers,
      });
    });
  }

  // ──────────────────────────────────────────────
  // 3. EFS
  // ──────────────────────────────────────────────
  if (useStorage && (awsToAzure || awsToGoogle)) {
    const buildableEfsConfigs = efsConfigs.filter((c) => c.build);

    const efsRes = createAwsEfs(scope, awsProvider, {
      efsConfigs: buildableEfsConfigs.map((config) => ({
        ...config,
        securityGroupIds:
          config.securityGroupIds?.map((name) => getSecurityGroupId(name)) ||
          [],
      })),
      subnets: awsVpcResources.subnetsByName,
    });

    efsRes.forEach((res) => {
      res.fileSystem.node.addDependency(awsVpcResources);
      res.mountTargets.forEach((t: any) =>
        t.node.addDependency(awsVpcResources),
      );
      res.accessPoints.forEach((ap: any) =>
        ap.node.addDependency(awsVpcResources),
      );
    });

    const efsMeta = efsRes
      .map((res, idx) => {
        const cfg = buildableEfsConfigs[idx];
        if (!cfg.cnameRecordName) return null;
        return {
          cnameRecordName: cfg.cnameRecordName,
          dnsFqdn: res.fileSystem.dnsName,
        };
      })
      .filter(
        (item): item is { cnameRecordName: string; dnsFqdn: string } =>
          item !== null,
      );

    output.efsInstances = efsMeta;
  }

  // ──────────────────────────────────────────────
  // 4. RDS / Aurora
  // ──────────────────────────────────────────────
  if (useDbs && (awsToGoogle || awsToAzure)) {
    const combinedConfigs: AwsRelationalDatabaseConfig[] = [
      ...mapRdsConfigs(),
      ...mapAuroraConfigs(),
    ].map((config) => {
      // Resolve the Enhanced Monitoring IAM role from the role name given
      // in aurorards.ts (config.monitoringRoleName), instead of a
      // hardcoded role name.
      const monitoringRoleName = (config as any).monitoringRoleName as
        | string
        | undefined;

      return {
        ...config,
        monitoringRoleArn:
          config.enableEnhancedMonitoring && monitoringRoleName
            ? getIamRoleArn(
                monitoringRoleName,
                `RDS/Aurora "${config.identifier}"`,
              )
            : undefined,
      };
    });

    const awsRelationalDatabases = createAwsRelationalDatabases(
      scope,
      awsProvider,
      {
        databaseConfigs: combinedConfigs.filter((c) => c.build),
        subnets: awsVpcResources.subnetsByName,
        securityGroups: awsVpcResources.securityGroupMapping,
      },
    );

    // Ensure each database's monitoring role (if used) is fully created
    // before the DB instance/cluster that references it.
    combinedConfigs
      .filter((c) => c.build)
      .forEach((config, index) => {
        const monitoringRoleName = (config as any).monitoringRoleName as
          | string
          | undefined;
        if (!config.enableEnhancedMonitoring || !monitoringRoleName) return;

        const monitoringRole = iamResources.createdRoles[monitoringRoleName];
        if (!monitoringRole) return;

        const dbOutput = awsRelationalDatabases[index];
        dbOutput.rdsCluster?.node.addDependency(monitoringRole);
        dbOutput.dbInstance?.node.addDependency(monitoringRole);
      });

    const rdsInstances: Array<{
      identifier: string;
      endpoint: string;
      address: string;
      port: number;
    }> = [];
    const auroraClusters: Array<{
      clusterIdentifier: string;
      endpoint: string;
      readerEndpoint?: string;
      port: number;
    }> = [];

    combinedConfigs
      .filter((c) => c.build)
      .forEach((config, index) => {
        const dbOutput = awsRelationalDatabases[index];
        const logGroupPrefix = dbOutput.rdsCluster
          ? `/aws/rds/cluster/${config.identifier}`
          : `/aws/rds/instance/${config.identifier}`;

        (config.enabledCloudwatchLogsExports || []).forEach((exportType) => {
          const logGroupName = `${logGroupPrefix}/${exportType}`;
          const logGroup = cloudwatchResources.createdLogGroups[logGroupName];
          if (logGroup) {
            dbOutput.rdsCluster?.node.addDependency(logGroup);
            dbOutput.dbInstance?.node.addDependency(logGroup);
          }
        });
        if (dbOutput.rdsCluster) {
          dbOutput.rdsCluster.node.addDependency(awsVpcResources);
          auroraClusters.push({
            clusterIdentifier: config.identifier,
            endpoint: dbOutput.rdsCluster.endpoint,
            readerEndpoint: dbOutput.rdsCluster.readerEndpoint,
            port: dbOutput.rdsCluster.port,
          });
        } else if (dbOutput.dbInstance) {
          dbOutput.dbInstance.node.addDependency(awsVpcResources);
          rdsInstances.push({
            identifier: config.identifier,
            endpoint: dbOutput.dbInstance.address,
            address: dbOutput.dbInstance.address,
            port: dbOutput.dbInstance.port,
          });
        }
      });

    output.dbResources = {
      rdsInstances: rdsInstances.length > 0 ? rdsInstances : undefined,
      auroraClusters: auroraClusters.length > 0 ? auroraClusters : undefined,
    };
  }

  // ──────────────────────────────────────────────
  // 5. EC2
  // ──────────────────────────────────────────────
  if (useVms && (awsToAzure || awsToGoogle)) {
    const awsEc2Instances = createAwsEc2Instances(scope, awsProvider, {
      instanceConfigs: ec2Configs.map((config) => {
        const { securityGroupIds, ...restConfig } = config;
        return {
          ...restConfig,
          securityGroupIds: securityGroupIds
            .map((name) => getSecurityGroupId(name))
            .filter((id): id is string => !!id),
          subnetKey: (config as any).subnetKey,
        };
      }),
      subnets: awsVpcResources.subnetsByName,
    });

    awsEc2Instances.forEach((instance) =>
      instance.node.addDependency(awsVpcResources),
    );
  }

  // ──────────────────────────────────────────────
  // 6. ACM Certificate + ALB + ECS
  // ──────────────────────────────────────────────
  if (useContainers && (awsToAzure || awsToGoogle) && albConfigs) {
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
            const targetZone = publicZones[(certConfig as any).validationZone];

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
          } as any,
          awsVpcResources.vpc.id,
        );

        albResources.alb.node.addDependency(awsVpcResources);
        Object.values(albResources.targetGroups).forEach((tg) =>
          tg.node.addDependency(awsVpcResources),
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

          const isBlueGreen = config.deploymentStrategy === "BLUE_GREEN";

          // Resolve IAM roles and CloudWatch Log Group directly from the
          // names configured in ecs.ts, instead of hardcoded role names.
          const executionRoleArn = getIamRoleArn(
            (config as any).executionRoleName,
            `ECS service "${config.name}" (executionRoleName)`,
          );
          const taskRoleArn = getIamRoleArn(
            (config as any).taskRoleName,
            `ECS service "${config.name}" (taskRoleName)`,
          );
          const infraRoleArn = isBlueGreen
            ? getIamRoleArn(
                (config as any).infraRoleName,
                `ECS service "${config.name}" (infraRoleName)`,
              )
            : undefined;

          const logGroupName = (config as any).cloudwatchLogGroupName as string;
          const logGroup = getLogGroup(
            logGroupName,
            `ECS service "${config.name}" (cloudwatchLogGroupName)`,
          );

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
            // IAM roles resolved from ecs.ts role names above
            executionRoleArn,
            taskRoleArn,
            infraRoleArn,
            // CloudWatch Log Group resolved from ecs.ts above
            cloudwatchLogGroupName: logGroupName,
          });

          ecs.service.node.addDependency(awsVpcResources.vpc);
          ecs.taskDefinition.node.addDependency(iamResources);
          ecs.taskDefinition.node.addDependency(logGroup);
        });
    }

    output.lbs = awsAlbs;

    // ──────────────────────────────────────────────
    // 7. DNS A-records (ALB alias records)
    // ──────────────────────────────────────────────
    if (useDns) {
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

  // ──────────────────────────────────────────────
  // 8. ECR + CodeBuild (VPC-compatible)
  // ──────────────────────────────────────────────
  if (useCicd && awsCicdConfigs) {
    awsCicdConfigs
      .filter((c) => c.build)
      .forEach((config) => {
        let loadedBuildspec: string | undefined = undefined;

        // Resolve IAM role and CloudWatch Log Group directly from the
        // names configured in cicdsettings.ts, instead of hardcoded names.
        const serviceRoleArn = getIamRoleArn(
          (config.codebuild as any).serviceRoleName,
          `CodeBuild project "${config.name}" (serviceRoleName)`,
        );
        const logGroupName = (config.codebuild as any)
          .cloudwatchLogGroupName as string;
        const logGroup = getLogGroup(
          logGroupName,
          `CodeBuild project "${config.name}" (cloudwatchLogGroupName)`,
        );

        const cicdRes = createAwsCicdResources(
          scope,
          awsProvider,
          {
            name: config.name,
            ecr: config.ecr,
            codebuild: {
              computeType: config.codebuild.computeType,
              image: config.codebuild.image,
              type: config.codebuild.type,
              privilegedMode: config.codebuild.privilegedMode,
              // Safely Convert to Security Group ID
              securityGroupIds: config.codebuild.securityGroupNames.map(
                (name) => getSecurityGroupId(name),
              ),
              // Convert to Subnet ID Safely
              subnetIds: config.codebuild.subnetNames.map((name) => {
                const subnet = awsVpcResources.subnetsByName[name];
                if (!subnet)
                  throw new Error(`Subnet ${name} not found for CodeBuild`);
                return subnet.id;
              }),
              repositoryUrl: config.codebuild.repositoryUrl,
              environmentVariables: config.codebuild.environmentVariables,
              buildspec: loadedBuildspec,
              // IAM role resolved from cicdsettings.ts above
              serviceRoleArn,
              // CloudWatch Log Group resolved from cicdsettings.ts above
              cloudwatchLogGroupName: logGroupName,
            },
            tags: config.tags,
          },
          awsVpcResources.vpc.id,
        );

        // Dependency Control for Deploying CI/CD Constructs After the VPC Is Fully Created
        cicdRes.codebuild.node.addDependency(awsVpcResources.vpc);
        cicdRes.codebuild.node.addDependency(iamResources);
        cicdRes.codebuild.node.addDependency(logGroup);
      });
  }

  return output;
};
