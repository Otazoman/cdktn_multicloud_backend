import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import { awsToGoogle, googleToAzure } from "../config/commonsettings";
import { gcpLbConfigs, gcpRunConfigs } from "../config/google/googlesettings";
import { createGoogleCertificate } from "../constructs/certificates/googlemanegedssl";
import { createGoogleCloudRunResources } from "../constructs/container/googlecloudrun";
import { createGoogleLbResources } from "../constructs/loadbarancer/googlelb";
import {
  GoogleLbResourcesWithDns,
  GoogleVpcResources,
  LoadBalancerDnsInfo,
} from "./interfaces";

export interface GoogleContainerResourcesOutput {
  googleLbs?: GoogleLbResourcesWithDns[];
}

/**
 * Creates Google Cloud Load Balancer and Cloud Run resources.
 *
 * Execution order (self-contained):
 *   1. Managed SSL Certificate (optional)
 *   2. Google Cloud Load Balancer (Global / Regional)
 *   3. Cloud Run services
 *
 * Condition: Runs only when awsToGoogle or googleToAzure is enabled,
 * and googleVpcResources + configs are available.
 */
export const createGoogleContainerResources = (
  scope: Construct,
  googleProvider: GoogleProvider,
  googleVpcResources?: GoogleVpcResources,
): GoogleContainerResourcesOutput => {
  if (!(awsToGoogle || googleToAzure) || !googleVpcResources || !gcpLbConfigs) {
    return {};
  }

  const globalLbs: any[] = [];
  const regionalLbs: any[] = [];

  // --- Step 1 & 2: Create Google LB resources (with SSL certificates) ---
  gcpLbConfigs
    .filter((config) => config.build)
    .forEach((config) => {
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

      // Forwarding Rule and Backend Services must be deleted before Proxy Subnet
      lb.forwardingRule.node.addDependency(googleVpcResources.vpc);
      if (googleVpcResources.proxySubnets) {
        googleVpcResources.proxySubnets.forEach((ps) => {
          lb.forwardingRule.node.addDependency(ps);
        });
      }

      Object.values(lb.backendServices).forEach((be) => {
        be.node.addDependency(googleVpcResources.vpc);
        if (googleVpcResources.proxySubnets) {
          googleVpcResources.proxySubnets.forEach((ps) => {
            be.node.addDependency(ps);
          });
        }
      });

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

  // --- Step 3: Create Cloud Run resources ---
  if (gcpRunConfigs) {
    gcpRunConfigs
      .filter((c) => c.build)
      .forEach((config) => {
        createGoogleCloudRunResources(scope, googleProvider, {
          ...config,
          container: {
            image: config.image,
            port: config.port,
          },
        });
      });
  }

  const googleLbs: GoogleLbResourcesWithDns[] = [
    {
      global: globalLbs,
      regional: regionalLbs,
    },
  ];

  return { googleLbs };
};
