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
        if (awsAlbs && config.targetGroupName) {
          for (const albRes of awsAlbs) {
            if (albRes.targetGroups[config.targetGroupName]) {
              targetGroupArn = albRes.targetGroups[config.targetGroupName].arn;
              break;
            }
          }
        }

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
            containerPort: config.port,
            hostPort: config.port,
          },
          targetGroupArn: targetGroupArn,
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
