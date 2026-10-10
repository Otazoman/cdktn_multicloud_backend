# Architecture

## Layers

```text
app.ts
 └ stacks/MultiCloudBackendStack.ts      single stack; knows no cloud names
    ├ providers/providers.ts              the only place providers are created
    ├ clouds/registry.ts                  runs every registered cloud module
    │   └ clouds/<cloud>/index.ts         foundations (network, ...) + feature modules
    │       └ clouds/<cloud>/<feature>.ts dns / storage / database / compute / container / cicd
    ├ resources/vpnResources.ts           cross-cloud VPN      (+ resources/vpn/<pair>.ts)
    └ resources/privateZoneResources.ts   cross-cloud private DNS (+ resources/privatezone/<cloud>.ts)
         ↓ call
    constructs/<category>/<cloud><service>.ts   resource definitions
         ↑ read
    config/                                  settings (data only)
    utils/                                   shared helpers (naming, dependencies)
```

## Flow

1. `createProviders()` declares the AWS, Google Cloud and Azure providers.
   Auxiliary providers (null) are created on demand through `providers.null(alias)`.
2. `createCloudResources()` runs each entry of `clouds/registry.ts` and
   collects the outputs into `CloudOutputs` (keyed by cloud id).
3. Each cloud module creates its foundations in `index.ts` (VPC / VNet; on
   AWS also CloudWatch Log Groups and IAM, on Azure also Azure Monitor), then
   calls one function per feature. Alerting (`monitoring.ts`) runs last so
   that alarms can target the resources created before it. Values shared
   between feature modules are passed in `<Cloud>BuildContext` (`context.ts`).
4. The stack builds a `CloudContext` (`scope`, `providers`, `outputs`) and
   passes it to the cross-cloud modules:
   - VPN, when `useVpn` is enabled — see [networking/vpn.md](networking/vpn.md)
   - private DNS, when `hostZones` is enabled

## Switches

| Setting (`config/commonsettings.ts`) | Read through | Meaning |
|---|---|---|
| `clouds.<cloud>.enabled` | `isCloudEnabled()` (`config/features.ts`) | Create the cloud at all |
| `clouds.<cloud>.features.<feature>` | `isFeatureEnabled()` | Create a feature. Independent of VPN |
| `awsToGoogle`, `awsToAzure`, `googleToAzure` | `isConnected()`, `isCloudConnected()`, `vpnConnections()` (`config/connections.ts`) | Direct VPN connection per pair |
| `env` | `env === "dev"` | Single-tunnel VPN (dev) / HA VPN with BGP (prod) |

Code must use the functions, not the flags, so that adding a cloud or
replacing the pair flags with a connection list only touches `config/`.

## Design rules

| Rule | Detail |
|---|---|
| One place for each concern | Providers in `providers/providers.ts`; connection logic in `config/connections.ts`; VPN inside addresses in `config/vpn/addressPlan.ts`; regions in `config/<cloud>/common.ts` |
| Names come from config | Every resource and sub-resource name is set in the config file of its feature. Omitted names fall back to `<PROJECT_NAME>-<cloud>-<type>[-<key>]` (`utils/naming.ts`) |
| Stable construct IDs | Construct IDs (Terraform addresses) do not depend on names users may change |
| Explicit dependencies | Use `addTerraformDependency()` (`utils/terraformDependency.ts`). `node.addDependency()` is **not** rendered into `depends_on` by cdktn |
| Pair logic stays explicit | Pairwise processing (VPN) is one module per pair; the code only shares the wiring |
| Constructs do not decide | Enable/disable decisions belong to `clouds/` and `resources/` |

## Testing

| Test | What it checks |
|---|---|
| `__tests__/synth-matrix.test.ts` | Synthesizes every `env` × VPN connection pattern for two feature sets (current config, everything enabled) and checks: no dependency cycles, valid `depends_on`, VPN pairs match the flags, Azure BGP addresses exist on the gateway |
| `__tests__/addressPlan.test.ts` | VPN inside addresses: /30 host addresses, no overlap, Azure APIPA range |
| `scripts/dev/synth-matrix.ts` | Before/after comparison of the synthesized output for refactoring |
