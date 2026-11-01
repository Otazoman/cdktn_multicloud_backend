/**
 * Host name collisions: two built load balancers of a cloud with the same
 * host name (same A record), or two clouds with the same public zone (same
 * NS record in the parent zone), stop the synthesis with a clear message.
 */
import { albConfigs } from "../config/aws/alb";
import { azureAppGwConfigs } from "../config/azure/applicationgateway";
import { gcpLbConfigs } from "../config/google/cloudloadbalancing";
import { assertUniquePublicZoneNames } from "../clouds/hostnames";
import { FEATURE_SETS, synthCase } from "../scripts/dev/synthMatrix";

const mutable: object[][] = [albConfigs, gcpLbConfigs, azureAppGwConfigs];
const snapshots = mutable.map((list) => list.map((c) => structuredClone(c)));

afterEach(() => {
  mutable.forEach((list, i) =>
    list.forEach((c, j) => {
      Object.keys(c).forEach((k) => delete (c as any)[k]);
      Object.assign(c, structuredClone(snapshots[i][j]));
    }),
  );
});

const synth = () => synthCase({ name: "hostnames", overrides: FEATURE_SETS.allOn });

test("Google: two load balancers with the same host name", () => {
  gcpLbConfigs.forEach((c) => (c.build = true));
  expect(synth).toThrow(
    /google: load balancers "run-regional-http-lb" and "run-regional-https-lb" both use the host name "api\.googletest\.tohonokai\.com".*config\/google\/cloudloadbalancing\.ts/,
  );
});

test("Azure: two Application Gateways with the same host name", () => {
  azureAppGwConfigs.forEach((c) => (c.build = true));
  expect(synth).toThrow(
    /azure: load balancers "plain-https-appgw" and "plain-http-appgw" both use the host name "api\.azuretest\.tohonokai\.com".*config\/azure\/applicationgateway\.ts/,
  );
});

test("AWS: two ALBs with the same host name", () => {
  albConfigs.forEach((c) => {
    c.build = true;
    c.dnsConfig = { subdomain: "awstest.tohonokai.com", fqdn: "api.awstest.tohonokai.com" };
  });
  expect(synth).toThrow(
    /aws: load balancers "managed-https-alb" and "plain-http-alb" both use the host name "api\.awstest\.tohonokai\.com".*config\/aws\/alb\.ts/,
  );
});

test("one load balancer per host name: no error", () => {
  gcpLbConfigs.forEach((c) => (c.build = c.protocol === "HTTP"));
  azureAppGwConfigs.forEach((c) => (c.build = c.name === "plain-http-appgw"));
  expect(synth).not.toThrow();
});

test("two clouds with the same public zone (NS record in the parent zone)", () => {
  expect(() =>
    assertUniquePublicZoneNames([
      { cloud: "aws", domain: "test.example.com" },
      { cloud: "azure", domain: "Test.Example.com." },
    ]),
  ).toThrow(/"test\.example\.com" is used by both aws and azure/);
  expect(() =>
    assertUniquePublicZoneNames([
      { cloud: "aws", domain: "awstest.example.com" },
      { cloud: "azure", domain: "azuretest.example.com" },
    ]),
  ).not.toThrow();
});
