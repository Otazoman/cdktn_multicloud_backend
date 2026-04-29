import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import { awsEcsConfigs } from "../config/aws/awssettings";
import { azureAcaConfigs } from "../config/azure/azuresettings";
import { gcpRunConfigs } from "../config/google/googlesettings";

import { createAwsEcsFargateResources } from "../constructs/container/awsecs";
import { createAzureContainerAppResources } from "../constructs/container/azureaca";
import { createGoogleCloudRunResources } from "../constructs/container/googlecloudrun";
import { AwsAlbResourcesWithDns, AwsVpcResources } from "./interfaces";

export const createComputeResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider,
  azureProvider: AzurermProvider,
  awsVpcResources?: AwsVpcResources,
  awsAlbs?: AwsAlbResourcesWithDns[],
) => {
  // --- AWS ECS Resources ---
  if (awsVpcResources && awsEcsConfigs) {
    awsEcsConfigs
      .filter((c) => c.build)
      .map((config) => {
        let targetGroupArn: string | undefined;
        let targetGroupArnGreen: string | undefined;
        let listenerArn: string | undefined;
        let testListenerArn: string | undefined;
        let productionListenerRuleArn: string | undefined;
        let testListenerRuleArn: string | undefined;

        if (awsAlbs) {
          for (const albRes of awsAlbs) {
            // BlueTG: look up by targetGroupName
            if (
              config.targetGroupName &&
              albRes.targetGroups[config.targetGroupName]
            ) {
              targetGroupArn = albRes.targetGroups[config.targetGroupName].arn;
            }
            // GreenTG: look up by targetGroupNameGreen
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

            // Production listener ARN: for blueGreenDeploymentConfig.productionTrafficRoute
            if (listenerName && albRes.listeners?.[listenerName]) {
              listenerArn = albRes.listeners[listenerName].arn;
            } else if (albRes.listener) {
              listenerArn = albRes.listener.arn;
            }

            // Test listener ARN: for blueGreenDeploymentConfig.testTrafficRoute
            if (testListenerName && albRes.listeners?.[testListenerName]) {
              testListenerArn = albRes.listeners[testListenerName].arn;
            }

            // Production listener RULE ARN: for advancedConfiguration.productionListenerRule
            // ECS Native Blue/Green requires a Listener Rule ARN here (not a Listener ARN)
            if (listenerName && albRes.namedListenerRules?.[listenerName]) {
              productionListenerRuleArn =
                albRes.namedListenerRules[listenerName].arn;
            }

            // Test listener RULE ARN: for advancedConfiguration.testListenerRule
            if (
              testListenerName &&
              albRes.namedListenerRules?.[testListenerName]
            ) {
              testListenerRuleArn =
                albRes.namedListenerRules[testListenerName].arn;
            }
          }
        }

        // Create ECS resources with updated config parameters
        const ecs = createAwsEcsFargateResources(scope, awsProvider, {
          ...config, // Pass through deploymentStrategy, autoScaling, and logRetentionInDays
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
            environment: (config as any).environment, // Ensure environment variables are passed
          },
          targetGroupArn: targetGroupArn,
          targetGroupArnGreen: targetGroupArnGreen,
          listenerArn: listenerArn,
          testListenerArn: testListenerArn,
          productionListenerRuleArn: productionListenerRuleArn,
          testListenerRuleArn: testListenerRuleArn,
        });

        ecs.service.node.addDependency(awsVpcResources.vpc);
        return ecs;
      });
  }

  // --- Google Cloud Run Resources ---
  if (gcpRunConfigs) {
    gcpRunConfigs
      .filter((c) => c.build)
      .map((config) => {
        return createGoogleCloudRunResources(scope, googleProvider, {
          ...config,
          container: {
            image: config.image,
            port: config.port,
          },
        });
      });
  }

  // --- Azure Container Apps Resources ---
  if (azureAcaConfigs) {
    azureAcaConfigs
      .filter((c) => c.build)
      .map((config) => {
        return createAzureContainerAppResources(scope, azureProvider, {
          ...config,
          container: {
            name: config.name,
            image: config.image,
            cpu: config.cpu,
            memory: config.memory,
          },
        });
      });
  }
};
