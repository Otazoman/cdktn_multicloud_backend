/**
 * Google Private Service Access: the destroy removes the VPC peering when
 * the API refuses to delete the connection (deletion_policy REMOVE_PEERING).
 */
import { googlePsaConfig } from "../config/google/psa";
import { FEATURE_SETS, synthCase } from "../scripts/dev/synthMatrix";

const resourcesOf = (synth: any, type: string): any[] =>
  Object.values(synth.resource?.[type] ?? {});

test("the connection's deletion policy comes from config/google/psa.ts", () => {
  const synth = synthCase({ name: "google-psa", overrides: FEATURE_SETS.allOn });
  const connections = resourcesOf(synth, "google_service_networking_connection");
  expect(connections).toHaveLength(1);
  expect(googlePsaConfig.deletionPolicy).toBe("REMOVE_PEERING");
  expect(connections[0].deletion_policy).toBe("REMOVE_PEERING");
}, 120000);
