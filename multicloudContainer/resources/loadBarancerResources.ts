import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktf/provider-google/lib/provider";
import { Token } from "cdktf";
import { Construct } from "constructs";
import { albConfigs } from "../config/aws/awssettings";
import { azureAppGwConfigs } from "../config/azure/applicationgateway";
import {
  awsToAzure,
  awsToGoogle,
  googleToAzure,
} from "../config/commonsettings";
import { gcpLbConfigs } from "../config/google/googlesettings";
import { createAwsAlbResources } from "../constructs/loadbarancer/awsalb";
import { createAzureAppGwResources } from "../constructs/loadbarancer/azureappgw";
import { createGoogleLbResources } from "../constructs/loadbarancer/googlelb";
import {
  AwsAlbResources,
  AwsVpcResources,
  AzureAppGwResources,
  AzureVnetResources,
  GoogleLbResources,
  GoogleVpcResources,
} from "./interfaces";

export const createLbResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider,
  azureProvider: AzurermProvider,
  awsVpcResources?: AwsVpcResources,
  googleVpcResources?: GoogleVpcResources,
  azureVnetResources?: AzureVnetResources,
): {
  awsAlbs?: AwsAlbResources[];
  googleLbs?: GoogleLbResources[];
  azureAppGws?: AzureAppGwResources[];
} => {
  let awsAlbs: AwsAlbResources[] | undefined;
  let googleLbs: GoogleLbResources[] | undefined;

  // --- AWS Load Balancer (ALB) ---
  if ((awsToAzure || awsToGoogle) && awsVpcResources && albConfigs) {
    const getAwsSecurityGroupId = (name: string): string => {
      const mapping = awsVpcResources.securityGroupMapping;
      if (mapping && typeof mapping === "object" && name in mapping) {
        return Token.asString(mapping[name as keyof typeof mapping]);
      }
      return "default-security-group-id";
    };

    const getAwsSubnetId = (name: string): string => {
      const subnet = awsVpcResources.subnetsByName[name];
      if (!subnet) {
        throw new Error(`Subnet with name ${name} not found for AWS ALB`);
      }
      return subnet.id;
    };

    awsAlbs = albConfigs
      .filter((config) => config.build)
      .map((config) => {
        const albResources = createAwsAlbResources(
          scope,
          awsProvider,
          {
            ...config,
            securityGroupIds: config.securityGroupNames.map((name) =>
              getAwsSecurityGroupId(name),
            ),
            subnetIds: config.subnetNames.map((name) => getAwsSubnetId(name)),
          } as any,
          awsVpcResources.vpc.id,
        );

        albResources.alb.node.addDependency(awsVpcResources);
        Object.values(albResources.targetGroups).forEach((tg) => {
          tg.node.addDependency(awsVpcResources);
        });

        return albResources;
      });
  }

  // --- Google Cloud Load Balancer (XLB) ---
  if ((awsToGoogle || googleToAzure) && googleVpcResources && gcpLbConfigs) {
    googleLbs = gcpLbConfigs
      .filter((config) => config.build)
      .map((config) => {
        const gcpLbResources = createGoogleLbResources(
          scope,
          googleProvider,
          config as any,
        );

        gcpLbResources.forwardingRule.node.addDependency(
          googleVpcResources.vpc,
        );

        Object.values(gcpLbResources.backendServices).forEach((be) => {
          be.node.addDependency(googleVpcResources.vpc);
        });

        return gcpLbResources;
      });
  }

  // --- Azure Application Gateway ---
  let azureAppGws: any[] = [];
  if (azureVnetResources && azureAppGwConfigs) {
    azureAppGws = azureAppGwConfigs
      .filter((config) => config.build)
      .map((config) => {
        const subnet = azureVnetResources.subnets[config.subnetName];
        if (!subnet)
          throw new Error(
            `Subnet ${config.subnetName} not found for Azure AppGW`,
          );

        const resources = createAzureAppGwResources(scope, azureProvider, {
          ...config,
          subnetId: subnet.id,
        } as any);

        resources.appGw.node.addDependency(azureVnetResources.subnets);
        return resources;
      });
  }

  // Return the created resources so other functions can use them (e.g., for ECS/GKE service registration)
  return { awsAlbs, googleLbs, azureAppGws };
};
