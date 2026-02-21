import { AcmCertificate } from "@cdktn/provider-aws/lib/acm-certificate";
import { AcmCertificateValidation } from "@cdktn/provider-aws/lib/acm-certificate-validation";
import { DataAwsRoute53Zone } from "@cdktn/provider-aws/lib/data-aws-route53-zone";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { Route53Record } from "@cdktn/provider-aws/lib/route53-record";
import { Construct } from "constructs";

/* -------------------- Interfaces -------------------- */

export interface AwsManagedCertWithDnsConfig {
  name: string;
  domainName: string;
  zoneName: string; // The Route53 Hosted Zone name where the domain is managed
  subjectAlternativeNames?: string[];
}

/**
 * Creates an ACM certificate and automatically performs DNS validation using Route53.
 */
export function createAwsCertificateWithDnsValidation(
  scope: Construct,
  provider: AwsProvider,
  config: AwsManagedCertWithDnsConfig,
) {
  // 1. Fetch existing Route53 Hosted Zone information
  const zone = new DataAwsRoute53Zone(scope, `zone-${config.name}`, {
    provider,
    name: config.zoneName,
  });

  // 2. Request an ACM Certificate
  const cert = new AcmCertificate(scope, `cert-${config.name}`, {
    provider,
    domainName: config.domainName,
    subjectAlternativeNames: config.subjectAlternativeNames,
    validationMethod: "DNS",
    lifecycle: {
      createBeforeDestroy: true,
    },
  });

  // 3. Create DNS records for validation
  // ACM provides the CNAME record details in domainValidationOptions.
  const validationRecord = new Route53Record(scope, `record-${config.name}`, {
    provider,
    zoneId: zone.zoneId,
    name: cert.domainValidationOptions.get(0).resourceRecordName,
    type: cert.domainValidationOptions.get(0).resourceRecordType,
    records: [cert.domainValidationOptions.get(0).resourceRecordValue],
    ttl: 60,
  });

  // 4. Wait for the certificate to be validated
  // This resource ensures that the deployment waits until the ACM validation status becomes "ISSUED".
  const validation = new AcmCertificateValidation(scope, `val-${config.name}`, {
    provider,
    certificateArn: cert.arn,
    validationRecordFqdns: [validationRecord.fqdn],
  });

  return {
    certificate: cert,
    certificateArn: validation.certificateArn, // Return the validated ARN
    hostedZoneId: zone.zoneId,
  };
}
