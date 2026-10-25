import { CloudwatchEventRule } from "@cdktn/provider-aws/lib/cloudwatch-event-rule";
import { CloudwatchEventTarget } from "@cdktn/provider-aws/lib/cloudwatch-event-target";
import { DataAwsCallerIdentity } from "@cdktn/provider-aws/lib/data-aws-caller-identity";
import { SnsTopicPolicy } from "@cdktn/provider-aws/lib/sns-topic-policy";
import { awsAlertingConfig, awsCicdConfigs } from "../../config/aws/awssettings";
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
      metricAlarms: awsAlertingConfig.alarms
        // Alarms of an ALB only while it is built (HTTP and HTTPS ALBs are
        // alternatives)
        .filter((alarm) => !alarm.loadBalancer || ctx.albsByName?.[alarm.loadBalancer])
        .map(({ notify, notifyOnOk, loadBalancer, ...alarm }) => {
          const topicArns = notify?.map((key) =>
            getTopicArn(key, alarm.alarmName),
          );
          return {
            ...alarm,
            dimensions: loadBalancer
              ? { ...alarm.dimensions, LoadBalancer: ctx.albsByName![loadBalancer].alb.arnSuffix }
              : alarm.dimensions,
            alarmActions: topicArns,
            okActions: notifyOnOk ? topicArns : undefined,
          };
        }),
    },
  );
  // Results of the CI/CD builds: EventBridge -> SNS
  const builds = awsAlertingConfig.buildNotifications;
  const projects = isFeatureEnabled("aws", "cicd")
    ? awsCicdConfigs.filter((c) => c.build).map((c) => c.name)
    : [];
  if (builds && projects.length > 0) {
    const rule = new CloudwatchEventRule(scope, "codebuild-results", {
      provider: awsProvider,
      name: resourceName(undefined, "aws", "codebuild-results"),
      description: "CodeBuild build results to the alert recipients",
      eventPattern: JSON.stringify({
        source: ["aws.codebuild"],
        "detail-type": ["CodeBuild Build State Change"],
        detail: { "project-name": projects, "build-status": builds.states },
      }),
    });
    const account = new DataAwsCallerIdentity(scope, "codebuild-results-account", {
      provider: awsProvider,
    }).accountId;
    builds.notify.forEach((key) => {
      const topicArn = getTopicArn(key, "codebuild-results");
      // EventBridge may publish to the topic. The policy replaces the
      // default one, so it keeps its statement (the account, CloudWatch
      // alarms) as well
      const policy = new SnsTopicPolicy(scope, `codebuild-results-topic-policy-${key}`, {
        provider: awsProvider,
        arn: topicArn,
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "__default_statement_ID",
              Effect: "Allow",
              Principal: { AWS: "*" },
              Action: [
                "SNS:GetTopicAttributes",
                "SNS:SetTopicAttributes",
                "SNS:AddPermission",
                "SNS:RemovePermission",
                "SNS:DeleteTopic",
                "SNS:Subscribe",
                "SNS:ListSubscriptionsByTopic",
                "SNS:Publish",
              ],
              Resource: topicArn,
              Condition: { StringEquals: { "AWS:SourceOwner": account } },
            },
            {
              Sid: "codebuild-results",
              Effect: "Allow",
              Principal: { Service: "events.amazonaws.com" },
              Action: "sns:Publish",
              Resource: topicArn,
              Condition: { ArnEquals: { "aws:SourceArn": rule.arn } },
            },
          ],
        }),
      });
      new CloudwatchEventTarget(scope, `codebuild-results-target-${key}`, {
        provider: awsProvider,
        rule: rule.name,
        arn: topicArn,
        inputTransformer: {
          inputPaths: {
            project: "$.detail.project-name",
            status: "$.detail.build-status",
            build: "$.detail.build-id",
          },
          inputTemplate: '"CodeBuild <project>: <status> (<build>)"',
        },
        dependsOn: [policy],
      });
    });
  }
}
