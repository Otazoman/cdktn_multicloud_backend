/**
 * Parent zone delegation: with state/<env>/parent-dns.json, the NS records
 * of every cloud's public zone are written into the parent zone (Route 53 of
 * another AWS account) through an aliased AWS provider that assumes the
 * parent account's role. The settings are mocked so that the test does not
 * depend on (or write) the real state directory.
 */
import { FEATURE_SETS, synthCase } from "../scripts/dev/synthMatrix";

const mockSettings = {
  current: undefined as
    | { roleArn: string; hostedZoneId: string; accountId: string }
    | undefined,
};
jest.mock("../config/parentdns", () => ({
  ...jest.requireActual("../config/parentdns"),
  parentDnsSettings: () => mockSettings.current,
}));

const resourcesOf = (synth: any, type: string): any[] =>
  Object.values(synth.resource?.[type] ?? {});

const nsRecords = (synth: any) =>
  resourcesOf(synth, "aws_route53_record").filter((r) => r.type === "NS");

afterEach(() => {
  mockSettings.current = undefined;
});

test("with the parent zone settings: one NS record per public zone, through the parent provider", () => {
  mockSettings.current = {
    roleArn: "arn:aws:iam::111122223333:role/cdktn-ns-delegation",
    hostedZoneId: "ZPARENT",
    accountId: "111122223333",
  };
  const synth = synthCase({ name: "parentdns", overrides: FEATURE_SETS.allOn });

  // Every public zone of the stack (which ones exist depends on the
  // load balancers built in the config)
  const zoneDomains = [
    // Private zones (aws.inner) have a VPC
    ...resourcesOf(synth, "aws_route53_zone")
      .filter((z) => !z.vpc)
      .map((z) => z.name),
    ...resourcesOf(synth, "google_dns_managed_zone")
      .filter((z) => z.visibility === "public")
      .map((z) => String(z.dns_name).replace(/\.$/, "")),
    ...resourcesOf(synth, "azurerm_dns_zone").map((z) => z.name),
  ].sort();
  expect(zoneDomains.length).toBeGreaterThan(0);

  const records = nsRecords(synth);
  expect(records.map((r) => r.name).sort()).toEqual(zoneDomains);
  records.forEach((r) => {
    expect(r).toMatchObject({
      provider: "aws.parent-dns",
      zone_id: "ZPARENT",
      ttl: 60,
      allow_overwrite: true,
    });
    // The name servers come from the zone created in this stack
    expect(String(r.records)).toMatch(/route53_zone|dns_managed_zone|dns_zone/);
  });

  const parentProvider = synth.provider.aws.find((p: any) => p.alias === "parent-dns");
  expect(parentProvider).toMatchObject({
    allowed_account_ids: ["111122223333"],
    assume_role: [{ role_arn: "arn:aws:iam::111122223333:role/cdktn-ns-delegation" }],
  });
});

test("without the settings file: no NS record and no parent provider (registered by hand)", () => {
  const synth = synthCase({ name: "parentdns-none", overrides: FEATURE_SETS.allOn });

  expect(nsRecords(synth)).toHaveLength(0);
  expect(synth.provider.aws.some((p: any) => p.alias === "parent-dns")).toBe(false);
});
