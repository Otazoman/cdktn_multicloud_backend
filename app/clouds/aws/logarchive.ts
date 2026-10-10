import { awsLogArchiveConfig } from "../../config/aws/awssettings";
import { isFeatureEnabled } from "../../config/features";
import { createAwsLogArchive } from "../../constructs/observability/awslogarchive";
import { resourceName } from "../../utils/naming";
import { AwsBuildContext } from "./context";

/** 10. Log archive to S3 (feature: logArchive) */
export function createAwsLogArchiveResources(ctx: AwsBuildContext): void {
  const { scope, awsProvider, getLogGroup } = ctx;

  if (!isFeatureEnabled("aws", "logArchive")) {
    return;
  }
  const config = awsLogArchiveConfig;
  if (!config.bucket.name) {
    throw new Error(
      "awsLogArchiveConfig.bucket.name (config/aws/monitoring.ts) is required when " +
        "clouds.aws.features.logArchive is enabled (S3 bucket names are globally unique).",
    );
  }

  const name = (configured: string | undefined, type: string, key?: string) =>
    resourceName(configured, "aws", `log-archive-${type}`, key);

  createAwsLogArchive(scope, awsProvider, {
    mode: config.mode,
    bucketName: config.bucket.name,
    forceDestroy: config.deleteOnDestroy,
    lifecycle: config.bucket.lifecycle,
    logGroups: config.logGroups.map((logGroupName) => {
      // "/aws/ecs/api-service" -> "aws-ecs-api-service"
      const key = logGroupName.replace(/^\/+/, "").replace(/[^a-zA-Z0-9-_]+/g, "-");
      return {
        key,
        name: getLogGroup(logGroupName, "awsLogArchiveConfig.logGroups").name,
        prefix: key,
        streamName: resourceName(
          config.names?.streamNames?.[logGroupName],
          "aws",
          "log-archive",
          key,
        ),
        subscriptionFilterName: resourceName(
          config.names?.subscriptionFilterNames?.[logGroupName],
          "aws",
          "log-archive",
          key,
        ),
      };
    }),
    firehose: {
      logsRoleName: name(config.names?.logsRoleName, "logs-role"),
      firehoseRoleName: name(config.names?.firehoseRoleName, "firehose-role"),
      ...config.firehose,
    },
    export: {
      lambdaName: name(config.names?.lambdaName, "export"),
      lambdaRoleName: name(config.names?.lambdaRoleName, "lambda-role"),
      scheduleName: name(config.names?.scheduleName, "schedule"),
      schedulerRoleName: name(config.names?.schedulerRoleName, "scheduler-role"),
      ...config.export,
    },
    tags: config.tags,
  });
}
