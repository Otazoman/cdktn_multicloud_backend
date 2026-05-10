import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import { awsToGoogle, googleToAzure } from "../config/commonsettings";
import { gcpLbConfigs, gcpRunConfigs } from "../config/google/googlesettings";
import { createGoogleCertificate } from "../constructs/certificates/googlemanegedssl";
import { createGoogleCloudRunResources } from "../constructs/container/googlecloudrun";
import { createGoogleLbResources } from "../constructs/loadbarancer/googlelb";
import {
  GoogleContainerResourcesOutput,
  GoogleLbResourcesWithDns,
  GoogleVpcResources,
  LoadBalancerDnsInfo,
} from "./interfaces";

/**
 * Creates Google Cloud Load Balancer and Cloud Run resources.
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

  // --- Step 1: Create Cloud Run resources FIRST ---
  // Store created Cloud Run services to link them with Load Balancers later
  const cloudRunServices: Record<string, any> = {};

  if (gcpRunConfigs) {
    gcpRunConfigs
      .filter((c) => c.build)
      .forEach((config) => {
        const res = createGoogleCloudRunResources(scope, googleProvider, {
          ...config,
          container: {
            image: config.image,
            port: config.port,
            cpu: config.cpu,
            memory: config.memory,
          },
        });
        // Save reference by service name
        cloudRunServices[config.name] = res.service;
      });
  }

  // --- Step 2: Create Google LB resources ---
  gcpLbConfigs
    .filter((config) => config.build)
    .forEach((config) => {
      let sslCertificateNames: string[] = [];

      // Handle SSL Certificates
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

      // Handle Proxy Subnet for Regional External Managed LB
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

      // Create Load Balancer resources
      const lb = createGoogleLbResources(
        scope,
        googleProvider,
        {
          ...config,
          protocol: config.protocol as "HTTP" | "HTTPS",
          loadBalancerType: config.loadBalancerType as "GLOBAL" | "REGIONAL",
          sslCertificateNames: sslCertificateNames,
          cloudRunResources: cloudRunServices,
        },
        googleVpcResources.vpc,
        targetProxySubnet,
      );

      // --- Step 3: Set Explicit Dependencies ---
      // Ensure VPC exists before LB
      lb.forwardingRule.node.addDependency(googleVpcResources.vpc);

      // Dependency on Proxy Subnet (Required for Regional External Managed LB)
      if (config.loadBalancerType === "REGIONAL" && targetProxySubnet) {
        lb.forwardingRule.node.addDependency(targetProxySubnet);
        Object.values(lb.backendServices).forEach((be) => {
          be.node.addDependency(targetProxySubnet);
        });
      }

      // Metadata for DNS
      if (config.dnsConfig) {
        const dnsInfo: LoadBalancerDnsInfo = {
          subdomain: config.dnsConfig.subdomain,
          fqdn: config.dnsConfig.fqdn,
        };
        (lb as any).dnsInfo = dnsInfo;
      }

      // Categorize LB
      if (config.loadBalancerType === "REGIONAL") {
        regionalLbs.push(lb);
      } else {
        globalLbs.push(lb);
      }
    });

  const googleLbs: GoogleLbResourcesWithDns[] = [
    {
      global: globalLbs,
      regional: regionalLbs,
    },
  ];

  return { googleLbs };
};
