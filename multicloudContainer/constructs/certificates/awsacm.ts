import * as fs from "fs";
import { AcmCertificate } from "@cdktn/provider-aws/lib/acm-certificate";
import { AcmCertificateValidation } from "@cdktn/provider-aws/lib/acm-certificate-validation";
import { DataAwsRoute53Zone } from "@cdktn/provider-aws/lib/data-aws-route53-zone";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Route53Record } from "@cdktn/provider-aws/lib/route53-record";
import { Construct } from "constructs";

/* -------------------- Interfaces -------------------- */

export interface AwsCertificateConfig {
  name: string;
  mode: "AWS_MANAGED" | "IMPORT"; // Switch between auto-renewal or file-based import
  // Parameters for AWS_MANAGED mode
  domainName?: string;
  zoneName?: string;
  subjectAlternativeNames?: string[];
  // Parameters for IMPORT mode
  certificatePath?: string;
  privateKeyPath?: string;
  certificateChainPath?: string;
}

/**
 * Centrally manages ACM certificates by either importing files or requesting via DNS validation.
 */
export function createAwsCertificate(
  scope: Construct,
  provider: AwsProvider,
  config: AwsCertificateConfig,
) {
  // --- Case 1: Import existing certificate files ---
  if (config.mode === "IMPORT") {
    if (!config.certificatePath || !config.privateKeyPath) {
      throw new Error(
        `Import mode requires certificatePath and privateKeyPath for ${config.name}`,
      );
    }

    // Read file contents from local disk to upload to AWS ACM
    const cert = new AcmCertificate(scope, `cert-import-${config.name}`, {
      provider,
      certificateBody: fs.readFileSync(config.certificatePath, "utf8"),
      privateKey: fs.readFileSync(config.privateKeyPath, "utf8"),
      certificateChain: config.certificateChainPath
        ? fs.readFileSync(config.certificateChainPath, "utf8")
        : undefined,
    });

    return {
      certificate: cert,
      certificateArn: cert.arn,
    };
  }

  // --- Case 2: Request new certificate with DNS validation ---
  if (!config.domainName || !config.zoneName) {
    throw new Error(
      `Managed mode requires domainName and zoneName for ${config.name}`,
    );
  }

  // Fetch the target Route53 hosted zone for DNS validation records
  const zone = new DataAwsRoute53Zone(scope, `zone-${config.name}`, {
    provider,
    name: config.zoneName,
  });

  // Request certificate from ACM
  const cert = new AcmCertificate(scope, `cert-${config.name}`, {
    provider,
    domainName: config.domainName,
    subjectAlternativeNames: config.subjectAlternativeNames,
    validationMethod: "DNS",
    lifecycle: { createBeforeDestroy: true },
  });

  // Create the CNAME record in Route53 to satisfy ACM's DNS validation
  const validationRecord = new Route53Record(scope, `record-${config.name}`, {
    provider,
    zoneId: zone.zoneId,
    name: cert.domainValidationOptions.get(0).resourceRecordName,
    type: cert.domainValidationOptions.get(0).resourceRecordType,
    records: [cert.domainValidationOptions.get(0).resourceRecordValue],
    ttl: 60,
  });

  // Resource to represent the validation process; deployment will wait until status is "ISSUED"
  const validation = new AcmCertificateValidation(scope, `val-${config.name}`, {
    provider,
    certificateArn: cert.arn,
    validationRecordFqdns: [validationRecord.fqdn],
  });

  return {
    certificate: cert,
    certificateArn: validation.certificateArn,
    hostedZoneId: zone.zoneId,
  };
}
