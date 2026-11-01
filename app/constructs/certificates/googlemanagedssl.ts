import { CertificateManagerCertificate } from "@cdktn/provider-google/lib/certificate-manager-certificate";
import { CertificateManagerDnsAuthorization } from "@cdktn/provider-google/lib/certificate-manager-dns-authorization";
import { ComputeManagedSslCertificate } from "@cdktn/provider-google/lib/compute-managed-ssl-certificate";
import { ComputeRegionSslCertificate } from "@cdktn/provider-google/lib/compute-region-ssl-certificate";
import { DnsRecordSet } from "@cdktn/provider-google/lib/dns-record-set";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { Construct } from "constructs";
import * as fs from "fs";

import { addTerraformDependency } from "../../utils/terraformDependency";
import { idPart } from "../../utils/naming";

/**
 * Configuration interface for creating a GCP SSL certificate.
 *
 * mode CERTIFICATE_MANAGER (REGIONAL only):
 *  - Google-managed certificate of Certificate Manager (issued and renewed
 *    by Google), authorized by DNS
 *  - Requires domains, region, dnsZone and dnsAuthorizationNames
 *
 * Otherwise, by `type`:
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
  /** Construct ID suffix (Terraform address). Defaults to `name` */
  id?: string;
  project?: string;
  type: "GLOBAL" | "REGIONAL";
  mode?: "CERTIFICATE_MANAGER" | "IMPORT";

  // Used for GLOBAL managed certificate and CERTIFICATE_MANAGER
  domains?: string[];

  // Used for REGIONAL self-managed certificate and CERTIFICATE_MANAGER
  region?: string;
  privateKeyPath?: string;
  certificatePath?: string;

  // Used for CERTIFICATE_MANAGER
  /** Public zone (Cloud DNS) that receives the authorization CNAME records */
  dnsZone?: { name: string; project: string };
  /** DNS authorization name per domain */
  dnsAuthorizationNames?: Record<string, string>;
}

/**
 * Creates a Google SSL certificate depending on the mode and the load
 * balancer scope.
 *
 * CERTIFICATE_MANAGER:
 *  - Creates a regional DNS authorization and its CNAME record per domain,
 *    and a regional Google-managed certificate of Certificate Manager
 *  - certificateId is passed to the target proxy's
 *    certificateManagerCertificates
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
  if (config.mode === "CERTIFICATE_MANAGER") {
    return createCertificateManagerCertificate(scope, provider, config);
  }

  // GLOBAL Load Balancer → Google Managed SSL
  if (config.type === "GLOBAL") {
    if (!config.domains || config.domains.length === 0) {
      throw new Error("Domains are required for GLOBAL managed certificate.");
    }

    const cert = new ComputeManagedSslCertificate(
      scope,
      `cert-${config.id ?? config.name}`,
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

  const cert = new ComputeRegionSslCertificate(
    scope,
    `cert-${config.id ?? config.name}`,
    {
      provider,
      name: config.name,
      project: config.project,
      region: config.region,
      privateKey: fs.readFileSync(config.privateKeyPath).toString(),
      certificate: fs.readFileSync(config.certificatePath).toString(),
    },
  );

  return {
    certificate: cert,
    certificateName: cert.name,
    certificateId: cert.id,
  };
}

/**
 * Regional Google-managed certificate of Certificate Manager. Regional
 * certificates support DNS authorization only, and a regional DNS
 * authorization must be of type PER_PROJECT_RECORD. One authorization covers
 * one domain.
 */
function createCertificateManagerCertificate(
  scope: Construct,
  provider: GoogleProvider,
  config: GcpCertificateConfig,
) {
  if (config.type !== "REGIONAL") {
    throw new Error(
      `Certificate Manager certificates are supported for REGIONAL load balancers only (${config.name}).`,
    );
  }
  if (!config.region || !config.domains || config.domains.length === 0) {
    throw new Error(
      `Certificate Manager certificate requires region and domains (${config.name}).`,
    );
  }
  const { dnsZone } = config;
  if (!dnsZone) {
    throw new Error(
      `Certificate Manager certificate requires dnsZone (${config.name}).`,
    );
  }

  const id = config.id ?? config.name;
  const authorizations = config.domains.map((domain) => {
    const authorizationName = config.dnsAuthorizationNames?.[domain];
    if (!authorizationName) {
      throw new Error(
        `Certificate Manager certificate requires a DNS authorization name for ${domain} (${config.name}).`,
      );
    }
    const authorization = new CertificateManagerDnsAuthorization(
      scope,
      `cert-dnsauth-${id}-${idPart(domain)}`,
      {
        provider,
        name: authorizationName,
        project: config.project,
        location: config.region,
        domain,
        type: "PER_PROJECT_RECORD",
      },
    );

    // CNAME record that Google checks to issue and renew the certificate
    const record = authorization.dnsResourceRecord.get(0);
    const recordSet = new DnsRecordSet(
      scope,
      `cert-dnsauth-rec-${id}-${idPart(domain)}`,
      {
        provider,
        project: dnsZone.project,
        managedZone: dnsZone.name,
        name: record.name,
        type: record.type,
        ttl: 300,
        rrdatas: [record.data],
      },
    );
    return { authorization, recordSet };
  });

  const cert = new CertificateManagerCertificate(scope, `cert-${id}`, {
    provider,
    name: config.name,
    project: config.project,
    location: config.region,
    managed: {
      domains: config.domains,
      dnsAuthorizations: authorizations.map((a) => a.authorization.id),
    },
  });
  // Issuance starts once the certificate exists: create the records first
  addTerraformDependency(
    cert,
    authorizations.map((a) => a.recordSet),
  );

  return {
    certificate: cert,
    certificateName: cert.name,
    certificateId: cert.id,
  };
}
