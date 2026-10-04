/**
 * Regression test: synthesizes the full stack for every env x VPN connection
 * pattern (see scripts/dev/synthMatrix.ts) and checks invariants that must
 * always hold. No snapshot is stored because the synthesized output contains
 * secrets from config/.env.
 */
import {
  buildDependencyGraph,
  buildMatrixCases,
  findDependencyCycle,
  synthCase,
} from "../scripts/dev/synthMatrix";

const resourcesOf = (synth: any, type: string): any[] =>
  Object.values(synth.resource?.[type] ?? {});

describe.each(buildMatrixCases().map((c) => [c.name, c] as const))(
  "%s",
  (_name, matrixCase) => {
    let synth: any;
    const { env, awsToGoogle, awsToAzure, googleToAzure, useVpn } =
      matrixCase.overrides as Record<string, any>;
    const vpnEnabled = useVpn ?? require("../config/commonsettings").useVpn;

    beforeAll(() => {
      synth = synthCase(matrixCase);
    }, 120000);

    test("has no dependency cycle", () => {
      expect(findDependencyCycle(buildDependencyGraph(synth))).toBeUndefined();
    });

    test("depends_on entries are plain addresses of existing resources", () => {
      const graph = buildDependencyGraph(synth);
      for (const instances of Object.values<any>(synth.resource ?? {})) {
        for (const body of Object.values<any>(instances)) {
          for (const dep of body.depends_on ?? []) {
            expect(dep).not.toContain("${");
            expect(graph.has(dep)).toBe(true);
          }
        }
      }
    });

    test("VPN pairs are built only for enabled connection flags", () => {
      if (!vpnEnabled) return;
      const cgwNames = resourcesOf(synth, "aws_customer_gateway").map(
        (r) => r.tags?.Name ?? "",
      );
      const googleTunnelNames = resourcesOf(
        synth,
        "google_compute_vpn_tunnel",
      ).map((r) => r.name ?? "");

      expect(cgwNames.some((n) => n.includes("-aws-google-cgw"))).toBe(
        awsToGoogle,
      );
      expect(cgwNames.some((n) => n.includes("-aws-azure-cgw"))).toBe(
        awsToAzure,
      );
      expect(googleTunnelNames.some((n) => n.includes("-gcp-azure-"))).toBe(
        googleToAzure,
      );
    });

    test("Azure VPN connections use the APIPA addresses of the VNG", () => {
      const connections = resourcesOf(
        synth,
        "azurerm_virtual_network_gateway_connection",
      );
      if (env === "dev") {
        // Single tunnel: static routing, no BGP
        for (const conn of connections) {
          expect(conn.bgp_enabled).toBe(false);
          expect(conn.custom_bgp_addresses).toBeUndefined();
        }
        return;
      }
      // HA: each connection must pin APIPA addresses that exist on the
      // corresponding VNG instance (primary: instance 1, secondary: instance 2)
      const [vng] = resourcesOf(synth, "azurerm_virtual_network_gateway");
      if (!vng) return;
      const [instance1, instance2] = vng.bgp_settings.peering_addresses;
      for (const conn of connections) {
        expect(conn.bgp_enabled).toBe(true);
        expect(instance1.apipa_addresses).toContain(
          conn.custom_bgp_addresses.primary,
        );
        expect(instance2.apipa_addresses).toContain(
          conn.custom_bgp_addresses.secondary,
        );
      }
    });
  },
);
