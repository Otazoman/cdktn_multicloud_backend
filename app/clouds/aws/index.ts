/**
 * AWS cloud module (registered in clouds/registry.ts).
 *
 * Resource creation order:
 *
 *   0. CloudWatch Log Groups & IAM Roles/Policies                index.ts
 *   1. VPC / Subnets / SGs / NAT / Route Tables                   index.ts
 *   2. Public DNS Zone          (features.dns)                    dns.ts
 *   3. EFS                      (features.storage)                storage.ts
 *   4. RDS / Aurora             (features.dbs)                    database.ts
 *   5. EC2                      (features.vms)                    compute.ts
 *   6. ACM Certificate + ALB + ECS, 7. DNS A-records
 *                               (features.containers [+ dns])     container.ts
 *   8. ECR + CodeBuild          (features.cicd)                   cicd.ts
 *   9. Metric Filters / Alarms  (features.alerting)               monitoring.ts
 *  10. Log archive to S3        (features.logArchive)             logarchive.ts
 *
 * Values shared between the modules are passed as AwsBuildContext
 * (context.ts).
 */

import { Providers } from "../../providers/providers";
import { Route53Zone } from "@cdktn/provider-aws/lib/route53-zone";
import { Token } from "cdktn";
import { Construct } from "constructs";

import {
  awsVpcResourcesparams,
  cloudwatchLogGroupsConfig,
  iamPoliciesConfig,
  iamRolesConfig,
} from "../../config/aws/awssettings";
import { isCloudEnabled } from "../../config/features";
import { AwsIamResources } from "../../constructs/iam/awsiam";
import { AwsCloudWatchResources } from "../../constructs/observability/awscloudwatch";
import { createAwsVpcResources } from "../../constructs/vpcnetwork/awsvpc";
import { AwsResourcesOutput, AwsVpcResources } from "./types";

import { AwsBuildContext } from "./context";
import { createAwsPublicDns } from "./dns";
import { createAwsStorage } from "./storage";
import { createAwsDatabases } from "./database";
import { createAwsVms } from "./compute";
import { createAwsContainers } from "./container";
import { createAwsCicd } from "./cicd";
import { createAwsMonitoring } from "./monitoring";
import { createAwsLogArchiveResources } from "./logarchive";

/**
 * Creates all AWS resources in dependency order: the foundations
 * (CloudWatch, IAM, VPC) here, then each feature module in turn. Each
 * feature is created when enabled in `clouds.aws` (commonsettings.ts).
 */
export const createAwsResources = (
  scope: Construct,
  providers: Providers,
): AwsResourcesOutput => {
  const awsProvider = providers.aws;
  const output: AwsResourcesOutput = {};

  if (!isCloudEnabled("aws")) {
    return output;
  }

  // ──────────────────────────────────────────────
  // 0. CloudWatch Log Groups & IAM
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
  // Declares the null provider (pins its version for the VPC's null_resource)
  providers.null();
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
    securityGroupMapping: vpcRaw.securityGroupMapping,
    publicRouteTable: vpcRaw.publicRouteTable,
    privateRouteTable: vpcRaw.privateRouteTable,
    ec2InstanceConnectEndpoint: vpcRaw.ec2InstanceConnectEndpoint,
  };

  output.vpc = awsVpcResources;

  // Helper: resolve SG id by name. Throws early if the name does not exist
  // in config/aws/vpc/securitygroups.ts, so a typo is caught immediately.
  const getSecurityGroupId = (name: string): string => {
    const mapping = awsVpcResources.securityGroupMapping;
    if (mapping && typeof mapping === "object" && name in mapping) {
      return Token.asString(mapping[name as keyof typeof mapping]);
    }
    throw new Error(
      `Security group "${name}" was not found. ` +
        `Make sure it is defined in config/aws/vpc/securitygroups.ts.`,
    );
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

  // Populated by createAwsPublicDns, used by createAwsContainers
  const publicZones: Record<string, Route53Zone> = {};

  const ctx: AwsBuildContext = {
    scope,
    awsProvider,
    output,
    awsVpcResources,
    cloudwatchResources,
    iamResources,
    publicZones,
    getSecurityGroupId,
    getIamRoleArn,
    getLogGroup,
  };

  createAwsPublicDns(ctx);
  createAwsStorage(ctx);
  createAwsDatabases(ctx);
  createAwsVms(ctx);
  createAwsContainers(ctx);
  createAwsCicd(ctx);
  createAwsMonitoring(ctx);
  createAwsLogArchiveResources(ctx);

  return output;
};
