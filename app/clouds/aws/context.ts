import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Route53Zone } from "@cdktn/provider-aws/lib/route53-zone";
import { SecretsmanagerSecret } from "@cdktn/provider-aws/lib/secretsmanager-secret";
import { Construct } from "constructs";
import { AwsIamResources } from "../../constructs/iam/awsiam";
import { AwsCloudWatchResources } from "../../constructs/observability/awscloudwatch";
import { AwsResourcesOutput, AwsVpcResources } from "./types";

/** Values shared between the AWS feature modules. */
export interface AwsBuildContext {
  scope: Construct;
  awsProvider: AwsProvider;
  output: AwsResourcesOutput;
  awsVpcResources: AwsVpcResources;
  cloudwatchResources: AwsCloudWatchResources;
  iamResources: AwsIamResources;
  publicZones: Record<string, Route53Zone>;
  getSecurityGroupId: (name: string) => string;
  getIamRoleArn: (roleName: string, contextLabel: string) => string;
  getLogGroup: (
    logGroupName: string,
    contextLabel: string,
  ) => AwsCloudWatchResources["createdLogGroups"][string];
  /** Secrets Manager secrets by key (config/aws/secrets.ts), set by the dbs feature */
  dbSecrets?: Map<string, SecretsmanagerSecret>;
}
