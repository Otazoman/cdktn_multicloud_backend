# Adding a cloud

This guide uses a hypothetical cloud `oci`. Existing cloud modules, the stack
and constructs of other clouds do not need to change.

## 1. Settings

1. `config/commonsettings.ts`
   - Add `"oci"` to `CloudId`.
   - Add an `oci` entry to `clouds` (`enabled`, `features`).
   - For each pair with an existing cloud, add a pair flag (e.g. `ociToAzure`).
2. `config/connections.ts`: add the pair flags to `connectionFlags`.
3. `config/oci/`: per-cloud settings, including `common.ts` (region) and
   resource names (see "Resource names" in [getting-started.md](getting-started.md#resource-names)).

## 2. Provider

`providers/providers.ts`: declare the provider and add it to `Providers`.

## 3. Constructs

`constructs/<category>/oci<service>.ts`, following `AGENTS.md` §9.1:
functions `createOci<Thing>(scope, provider, params)`, names from parameters
with `resourceName()` as fallback, `addTerraformDependency()` for ordering.

## 4. Cloud module

1. `clouds/oci/types.ts`: the module output (`OciResourcesOutput`) and other types.
2. `clouds/oci/context.ts`: values shared between feature modules.
3. `clouds/oci/index.ts`: foundations (network) and one call per feature,
   guarded by `isCloudEnabled("oci")` / `isFeatureEnabled("oci", ...)`.
4. `clouds/oci/<feature>.ts`: one file per feature.
5. Register it:
   - `clouds/types.ts`: add `oci: OciResourcesOutput` to `CloudOutputs`.
   - `clouds/registry.ts`: add `oci: createOciResources`.

## 5. VPN (if the cloud connects to others)

1. `resources/vpnResources.ts`: add the OCI gateway to `hubGatewaySteps`
   (guarded by `isCloudConnected("oci")`).
2. `resources/vpn/<pair>.ts`: one module per pair (e.g. `ociAzureVpn.ts`) with
   the signature `(ctx, resources, isSingleTunnel)`; register it in
   `pairwiseConnectionSteps`.
3. `config/vpn/addressPlan.ts`: the pair's BGP inside addresses.
   If the pair connects to Azure, add an entry to `AZURE_APIPA_SOURCES`
   (`resources/vpn/helpers.ts`).
4. `resources/vpn/types.ts`: add the gateway to `VpnResources.gateways` and,
   if needed, a resource kind to `VpnConnectionResources`.

See [networking/vpn.md](networking/vpn.md).

## 6. Private DNS (if needed)

Add `resources/privatezone/oci.ts` for the OCI side and call it from
`resources/privateZoneResources.ts`.

## 7. Tests and checks

1. `scripts/dev/synthMatrix.ts`: add `oci` to `FEATURE_SETS.allOn.clouds` and
   the new pair flags to the matrix.
2. `__tests__/synth-matrix.test.ts`: add VPN assertions for the new pairs.
3. `npx tsc --noEmit -p .`, `npx jest __tests__/synth-matrix.test.ts __tests__/addressPlan.test.ts`,
   then `cdktn diff`.
