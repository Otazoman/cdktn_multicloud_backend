import { awsAlertingConfig } from "../../config/aws/awssettings";
import { isFeatureEnabled } from "../../config/features";
import { AwsCloudWatchResources } from "../../constructs/observability/awscloudwatch";
import { createAwsSnsTopics } from "../../constructs/observability/awssns";
import { resourceName } from "../../utils/naming";
import { AwsBuildContext } from "./context";

/** 9. Notification targets, metric filters and alarms (feature: alerting) */
export function createAwsMonitoring(ctx: AwsBuildContext): void {
  const { scope, awsProvider, getLogGroup } = ctx;

  if (!isFeatureEnabled("aws", "alerting")) {
    return;
  }

  const topics = createAwsSnsTopics(
    scope,
    awsProvider,
    awsAlertingConfig.notificationTargets.map((target) => ({
      key: target.key,
      name: resourceName(target.name, "aws", "alerts", target.key),
      emails: target.emails,
      tags: target.tags,
    })),
  );

  const getTopicArn = (key: string, alarmName: string): string => {
    const topic = topics[key];
    if (!topic) {
      throw new Error(
        `Notification target "${key}" referenced by alarm "${alarmName}" was not found. ` +
          `Make sure it is defined in config/aws/monitoring.ts (notificationTargets).`,
      );
    }
    return topic.arn;
  };

  // Log groups are created up-front (aws-global-cloudwatch); referencing
  // their name attribute orders the metric filters after them.
  const metricFilters = awsAlertingConfig.metricFilters.map((filter) => ({
    ...filter,
    logGroupName: getLogGroup(
      filter.logGroupName,
      `metric filter "${filter.name}"`,
    ).name,
  }));

  // Separate from the up-front Log Group construct (aws-global-cloudwatch)
  // so that alarms can reference resources created by the other modules.
  // alarmActions reference the topic ARNs, which orders alarms after topics.
  new AwsCloudWatchResources(
    scope,
    "aws-alerting-cloudwatch",
    awsProvider,
    {
      metricFilters,
      metricAlarms: awsAlertingConfig.alarms.map(
        ({ notify, notifyOnOk, ...alarm }) => {
          const topicArns = notify?.map((key) =>
            getTopicArn(key, alarm.alarmName),
          );
          return {
            ...alarm,
            alarmActions: topicArns,
            okActions: notifyOnOk ? topicArns : undefined,
          };
        },
      ),
    },
  );
}
