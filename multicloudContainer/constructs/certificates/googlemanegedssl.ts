import { ComputeManagedSslCertificate } from "@cdktn/provider-google/lib/compute-managed-ssl-certificate";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";

/* -------------------- Interfaces -------------------- */

export interface GcpManagedCertConfig {
  name: string;
  domains: string[];
  project?: string;
}

export function createGoogleManagedCertificate(
  scope: Construct,
  provider: GoogleProvider,
  config: GcpManagedCertConfig,
) {
  const cert = new ComputeManagedSslCertificate(scope, `cert-${config.name}`, {
    provider,
    name: config.name,
    project: config.project,
    managed: {
      domains: config.domains,
    },
  });

  return {
    certificate: cert,
    certificateName: cert.name,
    certificateId: cert.id,
  };
}
