/**
 * Service Networking peered DNS domains: Cloud SQL resolves the private DNS
 * names of the other clouds (aws.inner, azure.inner) through the VPC, for
 * the logical replication subscriptions (config/google/privatezone.ts).
 */
import { apiContainerConfig } from "../config/apicontainer";
import { FEATURE_SETS, synthCase } from "../scripts/dev/synthMatrix";

// Partial connections are rejected by a cluster of APIs: synthesize with the
// clouds alone, whatever the environment's topology is
const configuredTopology = apiContainerConfig.topology;
beforeAll(() => {
  apiContainerConfig.topology = "independent";
});
afterAll(() => {
  apiContainerConfig.topology = configuredTopology;
});

const peeredDomains = (synth: any): any[] =>
  Object.values(synth.resource?.google_service_networking_peered_dns_domain ?? {});

const allConnected = {
  ...FEATURE_SETS.allOn,
  vpnMode: "singleTunnel",
  awsToGoogle: true,
  awsToAzure: true,
  googleToAzure: true,
};

test("one peered DNS domain per connected forwarding domain", () => {
  const domains = peeredDomains(synthCase({ name: "peered-dns", overrides: allConnected }));
  expect(domains.map((d) => [d.name, d.dns_suffix]).sort()).toEqual([
    ["aws-inner", "aws.inner."],
    ["azure-inner", "azure.inner."],
  ]);
  domains.forEach((d) => {
    expect(d.service).toBe("servicenetworking.googleapis.com");
    expect(d.network).toBe("${google_compute_network.googleVpc.name}");
    expect(d.depends_on[0]).toMatch(/^google_service_networking_connection\./);
  });
}, 120000);

test("only for the clouds connected to Google Cloud", () => {
  const domains = peeredDomains(
    synthCase({ name: "peered-dns-aws", overrides: { ...allConnected, googleToAzure: false, awsToAzure: false } }),
  );
  expect(domains.map((d) => d.dns_suffix)).toEqual(["aws.inner."]);
}, 120000);

test("none without the private DNS zones", () => {
  const domains = peeredDomains(
    synthCase({ name: "peered-dns-off", overrides: { ...allConnected, hostZones: false } }),
  );
  expect(domains).toEqual([]);
}, 120000);
