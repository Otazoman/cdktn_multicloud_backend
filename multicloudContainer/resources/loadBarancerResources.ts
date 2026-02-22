import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Token } from "cdktn";
import { Construct } from "constructs";
import * as fs from "fs";
import { albConfigs } from "../config/aws/awssettings";
import { azureAppGwConfigs } from "../config/azure/applicationgateway";
import {
  awsToAzure,
  awsToGoogle,
  googleToAzure,
} from "../config/commonsettings";
import { gcpLbConfigs } from "../config/google/googlesettings";
import { createAwsCertificate } from "../constructs/certificates/awsacm";
import { createGoogleCertificate } from "../constructs/certificates/googlemanegedssl";
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
  CreatedPublicZones,
} from "./interfaces";

export const createLbResources = (
  scope: Construct,
  awsProvider: AwsProvider,
  googleProvider: GoogleProvider,
  azureProvider: AzurermProvider,
  awsVpcResources?: AwsVpcResources,
  googleVpcResources?: GoogleVpcResources,
  azureVnetResources?: AzureVnetResources,
  dnsZones?: CreatedPublicZones,
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
        if (
          config.certificateConfig &&
          config.certificateConfig.enabled &&
          config.certificateConfig.domains &&
          config.certificateConfig.domains.length > 0
        ) {
          const certConfig = config.certificateConfig;

          // Handle IMPORT mode - check file existence first
          if (certConfig.mode === "IMPORT") {
            const certPath = (certConfig as any).certificatePath;
            const keyPath = (certConfig as any).privateKeyPath;

            // Validate paths are provided
            if (!certPath || !keyPath) {
              console.warn(
                `⚠️  Warning: Certificate paths not specified for ${config.name}.`,
              );
              console.warn(
                `    Certificate creation skipped. Please provide certificatePath and privateKeyPath.`,
              );
            }
            // Check if files exist
            else if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
              console.warn(
                `⚠️  Warning: Certificate files not found for ${config.name}.`,
              );
              console.warn(`    Expected: ${certPath}, ${keyPath}`);
              console.warn(
                `    Certificate creation skipped. Please create the files or set build: false.`,
              );
            }
            // Files exist - proceed with import
            else {
              const certResult = createAwsCertificate(scope, awsProvider, {
                name: `${config.name}-cert`,
                mode: "IMPORT",
                certificatePath: certPath,
                privateKeyPath: keyPath,
                certificateChainPath: (certConfig as any).certificateChainPath,
              });
              certificateArn = certResult.certificateArn;
            }
          }
          // Handle AWS_MANAGED mode - DNS zone required for validation
          else if (certConfig.mode === "AWS_MANAGED") {
            const targetZone =
              dnsZones?.awsZones[(certConfig as any).validationZone];

            if (!targetZone) {
              console.warn(
                `⚠️  Warning: DNS zone "${
                  (certConfig as any).validationZone
                }" not found for ${config.name}.`,
              );
              console.warn(
                `    Certificate creation skipped. Please create the zone first or use IMPORT mode.`,
              );
            } else {
              const certResult = createAwsCertificate(scope, awsProvider, {
                name: `${config.name}-cert`,
                mode: "AWS_MANAGED",
                domainName: certConfig.domains[0],
                zoneName: targetZone.name,
                subjectAlternativeNames: certConfig.domains.slice(1),
              });
              certificateArn = certResult.certificateArn;
            }
          }
        }

        // Create ALB with certificate
        const albResources = createAwsAlbResources(
          scope,
          awsProvider,
          {
            ...config,
            listenerConfig: {
              ...config.listenerConfig,
              certificateArn: certificateArn,
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
          const certRes = createGoogleCertificate(scope, googleProvider, {
            name: `${config.name}-cert`,
            domains: config.managedSsl.domains,
            project: config.project,
            type: config.loadBalancerType as "GLOBAL" | "REGIONAL",
            region: config.region,
            privateKeyPath: (config.managedSsl as any).privateKeyPath,
            certificatePath: (config.managedSsl as any).certificatePath,
          });

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

        // Add dependencies to ensure proper deletion order
        // Forwarding Rule and Backend Services must be deleted before Proxy Subnet
        lb.forwardingRule.node.addDependency(googleVpcResources.vpc);
        if (googleVpcResources.proxySubnets) {
          googleVpcResources.proxySubnets.forEach((ps) => {
            lb.forwardingRule.node.addDependency(ps);
          });
        }

        // Backend Services also depend on Proxy Subnets
        Object.values(lb.backendServices).forEach((be) => {
          be.node.addDependency(googleVpcResources.vpc);
          if (googleVpcResources.proxySubnets) {
            googleVpcResources.proxySubnets.forEach((ps) => {
              be.node.addDependency(ps);
            });
          }
        });

        // Add DNS info to the LB resource
        if (config.dnsConfig) {
          const dnsInfo: LoadBalancerDnsInfo = {
            subdomain: config.dnsConfig.subdomain,
            fqdn: config.dnsConfig.fqdn,
          };
          (lb as any).dnsInfo = dnsInfo;
        }

        if (config.loadBalancerType === "REGIONAL") {
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

        // Add dependencies to ensure proper deletion order
        // Application Gateway must be deleted before NSG Rules can be removed
        resources.appGw.node.addDependency(azureVnetResources.subnets);

        // Depend on NSGs
        if (azureVnetResources.nsgs) {
          Object.values(azureVnetResources.nsgs).forEach((nsg) => {
            resources.appGw.node.addDependency(nsg);
          });
        }

        // Depend on NSG Rules (ensures App GW is deleted before rules)
        if (azureVnetResources.nsgRules) {
          Object.values(azureVnetResources.nsgRules)
            .flat()
            .forEach((rule) => {
              resources.appGw.node.addDependency(rule);
            });
        }

        // Depend on Subnet-NSG Associations
        if (azureVnetResources.subnetAssociations) {
          azureVnetResources.subnetAssociations.forEach((association) => {
            resources.appGw.node.addDependency(association);
          });
        }

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
