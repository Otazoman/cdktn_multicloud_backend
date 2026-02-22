import { ComputeManagedSslCertificate } from "@cdktn/provider-google/lib/compute-managed-ssl-certificate";
import { ComputeRegionSslCertificate } from "@cdktn/provider-google/lib/compute-region-ssl-certificate";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import * as fs from "fs";

/**
 * Configuration interface for creating a GCP SSL certificate.
 *
 * GLOBAL:
 *  - Uses Google-managed SSL certificate
 *  - Requires domains
 *
 * REGIONAL:
 *  - Uses self-managed SSL certificate
 *  - Requires private key and certificate files
 */
export interface GcpCertificateConfig {
  name: string;
  project?: string;
  type: "GLOBAL" | "REGIONAL";

  // Used for GLOBAL managed certificate
  domains?: string[];

  // Used for REGIONAL self-managed certificate
  region?: string;
  privateKeyPath?: string;
  certificatePath?: string;
}

/**
 * Creates a Google SSL certificate depending on the load balancer scope.
 *
 * GLOBAL:
 *  - Creates a Google-managed SSL certificate
 *
 * REGIONAL:
 *  - Creates a self-managed SSL certificate
 */
export function createGoogleCertificate(
  scope: Construct,
  provider: GoogleProvider,
  config: GcpCertificateConfig,
) {
  // GLOBAL Load Balancer → Google Managed SSL
  if (config.type === "GLOBAL") {
    if (!config.domains || config.domains.length === 0) {
      throw new Error("Domains are required for GLOBAL managed certificate.");
    }

    const cert = new ComputeManagedSslCertificate(
      scope,
      `cert-${config.name}`,
      {
        provider,
        name: config.name,
        project: config.project,
        managed: {
          domains: config.domains,
        },
      },
    );

    return {
      certificate: cert,
      certificateName: cert.name,
      certificateId: cert.id,
    };
  }

  // REGIONAL Load Balancer → Self-managed SSL
  if (!config.region) {
    throw new Error("Region is required for REGIONAL certificate.");
  }

  if (!config.privateKeyPath || !config.certificatePath) {
    throw new Error(
      "Regional certificate requires privateKeyPath and certificatePath.",
    );
  }

  const cert = new ComputeRegionSslCertificate(scope, `cert-${config.name}`, {
    provider,
    name: config.name,
    project: config.project,
    region: config.region,
    privateKey: fs.readFileSync(config.privateKeyPath).toString(),
    certificate: fs.readFileSync(config.certificatePath).toString(),
  });

  return {
    certificate: cert,
    certificateName: cert.name,
    certificateId: cert.id,
  };
}
