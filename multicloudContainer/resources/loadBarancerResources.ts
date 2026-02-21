import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Token } from "cdktn";
import { Construct } from "constructs";
import { albConfigs } from "../config/aws/awssettings";
import { azureAppGwConfigs } from "../config/azure/applicationgateway";
import {
  awsToAzure,
  awsToGoogle,
  googleToAzure,
} from "../config/commonsettings";
import { gcpLbConfigs } from "../config/google/googlesettings";
import { createAwsCertificateWithDnsValidation } from "../constructs/certificates/awsacm";
import { createGoogleManagedCertificate } from "../constructs/certificates/googlemanegedssl";
import { createAwsAlbResources } from "../constructs/loadbarancer/awsalb";
import { createAzureAppGwResources } from "../constructs/loadbarancer/azureappgw";
import { createGoogleLbResources } from "../constructs/loadbarancer/googlelb";
import {
  AwsAlbResourcesWithDns,
  AwsVpcResources,
  AzureAppGwResourcesWithDns,
  AzureVnetResources,
  GoogleLbResourcesWithDns,
  GoogleVpcResources,
  LbResourcesOutputWithDns,
  LoadBalancerDnsInfo,
} from "./interfaces";

export const createLbResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider,
  azureProvider: AzurermProvider,
  awsVpcResources?: AwsVpcResources,
  googleVpcResources?: GoogleVpcResources,
  azureVnetResources?: AzureVnetResources,
): LbResourcesOutputWithDns => {
  let awsAlbs: AwsAlbResourcesWithDns[] | undefined;
  let googleLbs: GoogleLbResourcesWithDns[] | undefined;
  let azureAppGws: AzureAppGwResourcesWithDns[] | undefined;

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
        let certificateArn: string | undefined;

        // Create ACM certificate if enabled
        if (config.certificateConfig && config.certificateConfig.enabled) {
          const certResult = createAwsCertificateWithDnsValidation(
            scope,
            awsProvider,
            {
              name: `${config.name}-cert`,
              domainName: config.certificateConfig.domains[0],
              zoneName: config.certificateConfig.validationZone,
              subjectAlternativeNames:
                config.certificateConfig.domains.slice(1),
            },
          );

          certificateArn = certResult.certificateArn;
        }

        // Create ALB with certificate
        const albResources = createAwsAlbResources(
          scope,
          awsProvider,
          {
            ...config,
            listenerConfig: {
              ...config.listenerConfig,
              certificateArn:
                certificateArn || (config.listenerConfig as any).certificateArn,
            },
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

        // Prepare DNS info
        const dnsInfo: LoadBalancerDnsInfo = {
          subdomain: config.dnsConfig?.subdomain || "",
          fqdn: config.dnsConfig?.fqdn,
          dnsName: albResources.alb.dnsName,
        };

        return {
          ...albResources,
          dnsInfo,
          certificateArn,
        };
      });
  }

  // --- Google Cloud Load Balancer (XLB) ---
  if ((awsToGoogle || googleToAzure) && googleVpcResources && gcpLbConfigs) {
    const globalLbs: any[] = [];
    const regionalLbs: any[] = [];

    gcpLbConfigs
      .filter((config) => config.build)
      .forEach((config) => {
        // Handle managed SSL certificates for HTTPS load balancers
        let sslCertificateNames: string[] = [];

        if (
          config.managedSsl &&
          config.managedSsl.domains &&
          config.managedSsl.domains.length > 0
        ) {
          const certRes = createGoogleManagedCertificate(
            scope,
            googleProvider,
            {
              name: `${config.name}-cert`,
              domains: config.managedSsl.domains,
              project: config.project,
            },
          );

          sslCertificateNames.push(certRes.certificateName);
        }

        let targetProxySubnet: any = undefined;
        if (
          config.loadBalancerType === "REGIONAL" &&
          config.region &&
          googleVpcResources.proxySubnets
        ) {
          targetProxySubnet = googleVpcResources.proxySubnets.find(
            (ps) => ps.region === config.region,
          );
        }

        const lb = createGoogleLbResources(
          scope,
          googleProvider,
          {
            ...config,
            sslCertificateNames: sslCertificateNames,
          } as any,
          googleVpcResources.vpc,
          targetProxySubnet,
        );

        // dependency
        lb.forwardingRule.node.addDependency(googleVpcResources.vpc);
        if (googleVpcResources.proxySubnets) {
          googleVpcResources.proxySubnets.forEach((ps) => {
            lb.forwardingRule.node.addDependency(ps);
          });
        }

        Object.values(lb.backendServices).forEach((be) => {
          be.node.addDependency(googleVpcResources.vpc);
        });

        // Add DNS info to the LB resource
        if (config.dnsConfig) {
          const dnsInfo: LoadBalancerDnsInfo = {
            subdomain: config.dnsConfig.subdomain,
            fqdn: config.dnsConfig.fqdn,
          };
          (lb as any).dnsInfo = dnsInfo;
        }

        if ("region" in config && config.region) {
          regionalLbs.push(lb);
        } else {
          globalLbs.push(lb);
        }
      });

    googleLbs = [
      {
        global: globalLbs,
        regional: regionalLbs,
      },
    ];
  }

  // --- Azure Application Gateway ---
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

        // Prepare DNS info
        const dnsInfo: LoadBalancerDnsInfo = {
          subdomain: config.dnsConfig?.subdomain || "",
          fqdn: config.dnsConfig?.fqdn,
        };

        return {
          ...resources,
          dnsInfo,
        };
      });
  }

  // Return the created resources with DNS information
  return { awsAlbs, googleLbs, azureAppGws };
};
