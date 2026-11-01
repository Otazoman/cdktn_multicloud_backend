/**
 * Google Cloud HTTPS load balancer certificates: Certificate Manager
 * (Google issues and renews the certificate, DNS authorization) or uploaded
 * files (IMPORT).
 */
import { gcpLbConfigs } from "../config/google/cloudloadbalancing";
import { PUBLIC_DOMAIN } from "../config/google/common";
import { FEATURE_SETS, synthCase } from "../scripts/dev/synthMatrix";

const resourcesOf = (synth: any, type: string): any[] =>
  Object.values(synth.resource?.[type] ?? {});

const snapshots = gcpLbConfigs.map((c) => structuredClone(c));
const httpLb = gcpLbConfigs.find((c) => c.protocol === "HTTP")!;
const httpsLb = gcpLbConfigs.find((c) => c.protocol === "HTTPS")!;

const synthHttps = (features: Record<string, unknown> = FEATURE_SETS.allOn) => {
  // Both load balancers use the same host name: build the HTTPS one only
  httpLb.build = false;
  httpsLb.build = true;
  return synthCase({ name: "googlecert", overrides: features });
};

afterEach(() => {
  gcpLbConfigs.forEach((c, i) => {
    Object.keys(c).forEach((k) => delete (c as any)[k]);
    Object.assign(c, structuredClone(snapshots[i]));
  });
});

test("CERTIFICATE_MANAGER: regional certificate with a DNS authorization and its record", () => {
  const synth = synthHttps();
  const domain = `api.${PUBLIC_DOMAIN}`;

  const [authorization] = resourcesOf(synth, "google_certificate_manager_dns_authorization");
  expect(authorization).toMatchObject({
    name: "run-regional-https-lb-dnsauth-api",
    domain,
    location: httpsLb.region,
    type: "PER_PROJECT_RECORD",
  });

  const [cert] = resourcesOf(synth, "google_certificate_manager_certificate");
  expect(cert).toMatchObject({
    name: "run-regional-https-lb-cert",
    location: httpsLb.region,
    managed: { domains: [domain] },
  });
  expect(cert.managed.dns_authorizations).toHaveLength(1);
  expect(cert.depends_on).toHaveLength(1);

  // The CNAME record of the authorization goes into the public zone
  const record = resourcesOf(synth, "google_dns_record_set").find((r) =>
    String(r.name).includes("dns_resource_record"),
  );
  expect(record).toBeDefined();
  expect(record.rrdatas).toHaveLength(1);
  expect(record.managed_zone).toContain("google_dns_managed_zone.");

  // The proxy uses the Certificate Manager certificate only
  const [proxy] = resourcesOf(synth, "google_compute_region_target_https_proxy");
  expect(proxy.certificate_manager_certificates).toEqual([
    expect.stringContaining("google_certificate_manager_certificate."),
  ]);
  expect(proxy.ssl_certificates).toBeUndefined();
  expect(resourcesOf(synth, "google_compute_region_ssl_certificate")).toHaveLength(0);
});

// synth warns as well (synthCase silences console.warn)
test("CERTIFICATE_MANAGER without features.dns: no certificate", () => {
  const allOn = FEATURE_SETS.allOn as any;
  const synth = synthHttps({
    ...allOn,
    clouds: { ...allOn.clouds, google: { ...allOn.clouds.google, features: { ...allOn.clouds.google.features, dns: false } } },
  });
  expect(resourcesOf(synth, "google_certificate_manager_certificate")).toHaveLength(0);
  expect(resourcesOf(synth, "google_certificate_manager_dns_authorization")).toHaveLength(0);
});

test("IMPORT: the certificate files are uploaded as before", () => {
  httpsLb.managedSsl!.mode = "IMPORT";
  const synth = synthHttps();

  expect(resourcesOf(synth, "google_compute_region_ssl_certificate")).toHaveLength(1);
  expect(resourcesOf(synth, "google_certificate_manager_certificate")).toHaveLength(0);
  const [proxy] = resourcesOf(synth, "google_compute_region_target_https_proxy");
  expect(proxy.ssl_certificates).toHaveLength(1);
  expect(proxy.certificate_manager_certificates).toBeUndefined();
});
