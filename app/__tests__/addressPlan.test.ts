/**
 * Validates config/vpn/addressPlan.ts (BGP inside addresses per cloud pair).
 */
import { vpnAddressPlan } from "../config/vpn/addressPlan";

const toInt = (ip: string): number =>
  ip.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);

const parseCidr = (cidr: string) => {
  const [ip, prefix] = cidr.split("/");
  const size = 2 ** (32 - Number(prefix));
  const network = toInt(ip);
  return { network, size, prefix: Number(prefix) };
};

// Every tunnel of every pair, with its side addresses
const tunnels = [
  ...vpnAddressPlan.awsAzure.tunnels.flat().map((t) => ({
    pair: "aws-azure",
    insideCidr: t.insideCidr,
    ips: [t.awsIp, t.azureIp],
    azureIp: t.azureIp,
  })),
  ...vpnAddressPlan.googleAzure.tunnels.map((t) => ({
    pair: "google-azure",
    insideCidr: t.insideCidr,
    ips: [t.googleIp, t.azureIp],
    azureIp: t.azureIp,
  })),
];

describe("VPN address plan", () => {
  test.each(tunnels.map((t) => [t.pair, t.insideCidr, t] as const))(
    "%s %s: both addresses are distinct host addresses of a /30",
    (_pair, _cidr, tunnel) => {
      const { network, size, prefix } = parseCidr(tunnel.insideCidr);
      expect(prefix).toBe(30);
      expect(network % size).toBe(0);
      const [a, b] = tunnel.ips.map(toInt);
      expect(a).not.toBe(b);
      for (const ip of [a, b]) {
        // Exclude the network and broadcast addresses
        expect(ip).toBeGreaterThan(network);
        expect(ip).toBeLessThan(network + size - 1);
      }
    },
  );

  test("/30 ranges do not overlap across pairs", () => {
    const networks = tunnels.map((t) => parseCidr(t.insideCidr).network);
    expect(new Set(networks).size).toBe(networks.length);
  });

  test("Azure-side addresses are within the Azure custom APIPA range", () => {
    const min = toInt("169.254.21.0");
    const max = toInt("169.254.22.255");
    for (const tunnel of tunnels) {
      const ip = toInt(tunnel.azureIp);
      expect(ip).toBeGreaterThanOrEqual(min);
      expect(ip).toBeLessThanOrEqual(max);
    }
  });

  test("one entry per Azure VPN gateway instance (active-active: 2)", () => {
    expect(vpnAddressPlan.awsAzure.tunnels).toHaveLength(2);
    for (const instance of vpnAddressPlan.awsAzure.tunnels) {
      expect(instance).toHaveLength(2); // AWS tunnel1 / tunnel2
    }
    expect(vpnAddressPlan.googleAzure.tunnels).toHaveLength(2);
  });
});
