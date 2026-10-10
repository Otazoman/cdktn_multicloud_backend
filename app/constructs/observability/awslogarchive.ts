import * as path from "path";
import { CloudwatchLogGroup } from "@cdktn/provider-aws/lib/cloudwatch-log-group";
import { CloudwatchLogSubscriptionFilter } from "@cdktn/provider-aws/lib/cloudwatch-log-subscription-filter";
import { DataAwsCallerIdentity } from "@cdktn/provider-aws/lib/data-aws-caller-identity";
import { IamRole } from "@cdktn/provider-aws/lib/iam-role";
import { IamRolePolicy } from "@cdktn/provider-aws/lib/iam-role-policy";
import { KinesisFirehoseDeliveryStream } from "@cdktn/provider-aws/lib/kinesis-firehose-delivery-stream";
import { LambdaFunction } from "@cdktn/provider-aws/lib/lambda-function";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { S3Bucket } from "@cdktn/provider-aws/lib/s3-bucket";
import { S3BucketLifecycleConfiguration } from "@cdktn/provider-aws/lib/s3-bucket-lifecycle-configuration";
import { S3BucketPolicy } from "@cdktn/provider-aws/lib/s3-bucket-policy";
import { S3BucketPublicAccessBlock } from "@cdktn/provider-aws/lib/s3-bucket-public-access-block";
import { SchedulerSchedule } from "@cdktn/provider-aws/lib/scheduler-schedule";
import { AssetType, TerraformAsset } from "cdktn";
import { Construct } from "constructs";
import { addTerraformDependency } from "../../utils/terraformDependency";

const EXPORT_LAMBDA_DIR = path.resolve(
  __dirname,
  "../../assets/lambda/cwl-export",
);

/** Log group to archive. */
export interface AwsArchivedLogGroup {
  /** Construct ID key (Terraform address) */
  key: string;
  /** Log group name (attribute reference, so the group is created first) */
  name: string;
  /** S3 prefix of the log group */
  prefix: string;
  /** Firehose delivery stream name (mode "firehose") */
  streamName: string;
  /** Subscription filter name (mode "firehose") */
  subscriptionFilterName: string;
}

export interface AwsLogArchiveParams {
  mode: "firehose" | "export";
  bucketName: string;
  /** Delete the bucket together with its contents on destroy */
  forceDestroy: boolean;
  lifecycle?: { transitionToGlacierDays?: number; expireDays?: number };
  logGroups: AwsArchivedLogGroup[];
  firehose?: {
    /** CloudWatch Logs -> Firehose role */
    logsRoleName: string;
    /** Firehose -> S3 role */
    firehoseRoleName: string;
    bufferingSizeMb?: number;
    bufferingIntervalSeconds?: number;
  };
  export?: {
    lambdaName: string;
    lambdaRoleName: string;
    lambdaLogRetentionDays: number;
    scheduleName: string;
    schedulerRoleName: string;
    scheduleExpression: string;
    scheduleExpressionTimezone?: string;
  };
  tags?: { [key: string]: string };
}

const assumeRolePolicy = (service: string, condition?: object) =>
  JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: service },
        Action: "sts:AssumeRole",
        ...(condition ? { Condition: condition } : {}),
      },
    ],
  });

const policyDocument = (statements: object[]) =>
  JSON.stringify({ Version: "2012-10-17", Statement: statements });

/**
 * Archives CloudWatch log groups to an S3 bucket, either continuously
 * (subscription filter -> Firehose -> S3) or once a day (EventBridge
 * Scheduler -> Lambda -> CreateExportTask -> S3).
 */
export function createAwsLogArchive(
  scope: Construct,
  provider: AwsProvider,
  params: AwsLogArchiveParams,
) {
  const account = new DataAwsCallerIdentity(scope, "aws-log-archive-account", {
    provider,
  });
  const region = provider.region;

  // 1. S3 bucket
  const bucket = new S3Bucket(scope, "aws-log-archive-bucket", {
    provider,
    bucket: params.bucketName,
    forceDestroy: params.forceDestroy,
    tags: params.tags,
  });
  new S3BucketPublicAccessBlock(scope, "aws-log-archive-bucket-public-access", {
    provider,
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  });
  const { transitionToGlacierDays, expireDays } = params.lifecycle ?? {};
  if (transitionToGlacierDays || expireDays) {
    new S3BucketLifecycleConfiguration(scope, "aws-log-archive-bucket-lifecycle", {
      provider,
      bucket: bucket.id,
      rule: [
        {
          id: "archive",
          status: "Enabled",
          filter: [{ prefix: "" }],
          transition: transitionToGlacierDays
            ? [{ days: transitionToGlacierDays, storageClass: "GLACIER" }]
            : undefined,
          expiration: expireDays ? [{ days: expireDays }] : undefined,
        },
      ],
    });
  }

  // 2a. Continuous delivery through Firehose (one stream per log group)
  if (params.mode === "firehose" && params.firehose) {
    const firehoseRole = new IamRole(scope, "aws-log-archive-firehose-role", {
      provider,
      name: params.firehose.firehoseRoleName,
      assumeRolePolicy: assumeRolePolicy("firehose.amazonaws.com", {
        StringEquals: { "sts:ExternalId": account.accountId },
      }),
      tags: params.tags,
    });
    const firehosePolicy = new IamRolePolicy(
      scope,
      "aws-log-archive-firehose-role-policy",
      {
        provider,
        role: firehoseRole.id,
        name: "s3-delivery",
        policy: policyDocument([
          {
            Effect: "Allow",
            Action: [
              "s3:AbortMultipartUpload",
              "s3:GetBucketLocation",
              "s3:GetObject",
              "s3:ListBucket",
              "s3:ListBucketMultipartUploads",
              "s3:PutObject",
            ],
            Resource: [bucket.arn, `${bucket.arn}/*`],
          },
        ]),
      },
    );

    const streams = params.logGroups.map((group) => {
      const stream = new KinesisFirehoseDeliveryStream(
        scope,
        `aws-log-archive-stream-${group.key}`,
        {
          provider,
          name: group.streamName,
          destination: "extended_s3",
          extendedS3Configuration: {
            roleArn: firehoseRole.arn,
            bucketArn: bucket.arn,
            // Firehose appends YYYY/MM/DD/HH/ to the prefix
            prefix: `${group.prefix}/`,
            errorOutputPrefix: `errors/${group.prefix}/!{firehose:error-output-type}/`,
            bufferingSize: params.firehose!.bufferingSizeMb,
            bufferingInterval: params.firehose!.bufferingIntervalSeconds,
            // Records from CloudWatch Logs are already gzip-compressed
            compressionFormat: "UNCOMPRESSED",
          },
          tags: params.tags,
        },
      );
      addTerraformDependency(stream, firehosePolicy);
      return { group, stream };
    });

    const logsRole = new IamRole(scope, "aws-log-archive-logs-role", {
      provider,
      name: params.firehose.logsRoleName,
      assumeRolePolicy: assumeRolePolicy(`logs.amazonaws.com`, {
        StringLike: {
          "aws:SourceArn": `arn:aws:logs:${region}:${account.accountId}:*`,
        },
      }),
      tags: params.tags,
    });
    const logsPolicy = new IamRolePolicy(scope, "aws-log-archive-logs-role-policy", {
      provider,
      role: logsRole.id,
      name: "firehose-put",
      policy: policyDocument([
        {
          Effect: "Allow",
          Action: ["firehose:PutRecord", "firehose:PutRecordBatch"],
          Resource: streams.map(({ stream }) => stream.arn),
        },
      ]),
    });

    streams.forEach(({ group, stream }) => {
      const filter = new CloudwatchLogSubscriptionFilter(
        scope,
        `aws-log-archive-subscription-${group.key}`,
        {
          provider,
          name: group.subscriptionFilterName,
          logGroupName: group.name,
          filterPattern: "",
          destinationArn: stream.arn,
          roleArn: logsRole.arn,
        },
      );
      addTerraformDependency(filter, logsPolicy);
    });
  }

  // 2b. Daily export task through Lambda
  if (params.mode === "export" && params.export) {
    const exportParams = params.export;

    // CloudWatch Logs needs write access to the bucket for export tasks
    new S3BucketPolicy(scope, "aws-log-archive-bucket-policy", {
      provider,
      bucket: bucket.id,
      policy: policyDocument([
        {
          Effect: "Allow",
          Principal: { Service: `logs.${region}.amazonaws.com` },
          Action: "s3:GetBucketAcl",
          Resource: bucket.arn,
          Condition: { StringEquals: { "aws:SourceAccount": account.accountId } },
        },
        {
          Effect: "Allow",
          Principal: { Service: `logs.${region}.amazonaws.com` },
          Action: "s3:PutObject",
          Resource: `${bucket.arn}/*`,
          Condition: {
            StringEquals: {
              "s3:x-amz-acl": "bucket-owner-full-control",
              "aws:SourceAccount": account.accountId,
            },
          },
        },
      ]),
    });

    // Created up-front so that it is destroyed with the stack
    const lambdaLogGroup = new CloudwatchLogGroup(
      scope,
      "aws-log-archive-lambda-log-group",
      {
        provider,
        name: `/aws/lambda/${exportParams.lambdaName}`,
        retentionInDays: exportParams.lambdaLogRetentionDays,
        tags: params.tags,
      },
    );

    const lambdaRole = new IamRole(scope, "aws-log-archive-lambda-role", {
      provider,
      name: exportParams.lambdaRoleName,
      assumeRolePolicy: assumeRolePolicy("lambda.amazonaws.com"),
      tags: params.tags,
    });
    const lambdaPolicy = new IamRolePolicy(
      scope,
      "aws-log-archive-lambda-role-policy",
      {
        provider,
        role: lambdaRole.id,
        name: "export-logs",
        policy: policyDocument([
          {
            Effect: "Allow",
            Action: ["logs:CreateExportTask", "logs:DescribeExportTasks"],
            Resource: "*",
          },
          {
            Effect: "Allow",
            Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
            Resource: `${lambdaLogGroup.arn}:*`,
          },
        ]),
      },
    );

    const code = new TerraformAsset(scope, "aws-log-archive-lambda-code", {
      path: EXPORT_LAMBDA_DIR,
      type: AssetType.ARCHIVE,
    });
    const lambda = new LambdaFunction(scope, "aws-log-archive-lambda", {
      provider,
      functionName: exportParams.lambdaName,
      role: lambdaRole.arn,
      runtime: "python3.12",
      handler: "index.handler",
      filename: code.path,
      sourceCodeHash: code.assetHash,
      // Export tasks run one at a time; leave room for several log groups
      timeout: 900,
      environment: {
        variables: {
          BUCKET: bucket.bucket,
          LOG_GROUPS: JSON.stringify(
            params.logGroups.map((group) => ({
              name: group.name,
              prefix: group.prefix,
            })),
          ),
        },
      },
      loggingConfig: { logFormat: "Text", logGroup: lambdaLogGroup.name },
      tags: params.tags,
    });
    addTerraformDependency(lambda, lambdaPolicy);

    const schedulerRole = new IamRole(scope, "aws-log-archive-scheduler-role", {
      provider,
      name: exportParams.schedulerRoleName,
      assumeRolePolicy: assumeRolePolicy("scheduler.amazonaws.com", {
        StringEquals: { "aws:SourceAccount": account.accountId },
      }),
      tags: params.tags,
    });
    const schedulerPolicy = new IamRolePolicy(
      scope,
      "aws-log-archive-scheduler-role-policy",
      {
        provider,
        role: schedulerRole.id,
        name: "invoke-export",
        policy: policyDocument([
          {
            Effect: "Allow",
            Action: "lambda:InvokeFunction",
            Resource: lambda.arn,
          },
        ]),
      },
    );
    const schedule = new SchedulerSchedule(scope, "aws-log-archive-schedule", {
      provider,
      name: exportParams.scheduleName,
      scheduleExpression: exportParams.scheduleExpression,
      scheduleExpressionTimezone: exportParams.scheduleExpressionTimezone,
      flexibleTimeWindow: { mode: "OFF" },
      target: { arn: lambda.arn, roleArn: schedulerRole.arn },
    });
    addTerraformDependency(schedule, schedulerPolicy);
  }

  return { bucket };
}
