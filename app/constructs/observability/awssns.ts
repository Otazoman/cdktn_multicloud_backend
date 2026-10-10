import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { SnsTopic } from "@cdktn/provider-aws/lib/sns-topic";
import { SnsTopicSubscription } from "@cdktn/provider-aws/lib/sns-topic-subscription";
import { Construct } from "constructs";
import { addTerraformDependency } from "../../utils/terraformDependency";

/**
 * SNS topic used as a notification target of CloudWatch alarms.
 */
export interface AwsSnsTopicParams {
  /** Construct ID key (Terraform address) */
  key: string;
  /** Topic name */
  name: string;
  /** Email addresses subscribed to the topic. Each recipient must confirm the subscription. */
  emails?: string[];
  tags?: { [key: string]: string };
}

/**
 * Creates SNS topics with their email subscriptions. Returns the topics by key.
 */
export function createAwsSnsTopics(
  scope: Construct,
  provider: AwsProvider,
  params: AwsSnsTopicParams[],
): Record<string, SnsTopic> {
  const topics: Record<string, SnsTopic> = {};

  params.forEach((topicParams) => {
    const topic = new SnsTopic(scope, `sns-topic-${topicParams.key}`, {
      provider,
      name: topicParams.name,
      tags: topicParams.tags,
    });

    (topicParams.emails ?? []).forEach((email) => {
      const sanitizedEmail = email.replace(/[^a-zA-Z0-9-_]/g, "-");
      const subscription = new SnsTopicSubscription(
        scope,
        `sns-sub-${topicParams.key}-${sanitizedEmail}`,
        {
          provider,
          topicArn: topic.arn,
          protocol: "email",
          endpoint: email,
        },
      );
      addTerraformDependency(subscription, topic);
    });

    topics[topicParams.key] = topic;
  });

  return topics;
}
