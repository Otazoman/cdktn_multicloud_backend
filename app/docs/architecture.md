# Architecture

[日本語](architecture.ja.md)

For the meaning of every setting, see the [configuration reference](configuration/README.md).

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
| `vpnMode` | `vpnMode === "singleTunnel"` | Single-tunnel VPN (`singleTunnel`) / HA VPN with BGP (`haBgp`); set per environment with `byEnv` |

Code must use the functions, not the flags, so that adding a cloud or
replacing the pair flags with a connection list only touches `config/`.

## Environments

One repository and one branch deploy `dev`, `stg` and `prod` to separate cloud accounts. The environment is chosen by `DEPLOY_ENV` (one container per environment).

| Concern | How |
|---|---|
| Selecting values | `byEnv({...})` in the config file (`config/environment.ts`); only values that differ between environments are written per environment |
| Unique names | `envScopedName()` appends the environment name outside `dev` (Key Vault, ACR, Azure DB servers, storage accounts) |
| Credentials and secrets | `.env.<env>` in the repository root, loaded by `compose.yaml` into the container of that environment |
| Accounts | `accounts` in `config/commonsettings.ts` and `PROJECT_NAME` in `config/google/common.ts`; the providers refuse to run against another account |
| State | `state/<env>/terraform.tfstate` (`LocalBackend` in `stacks/MultiCloudBackendStack.ts`) |
| VPN method | `vpnMode`, per environment |

See [configuration/common.md](configuration/common.md) and [ai/feat04_environments_design.md](ai/feat04_environments_design.md).

## Design rules

| Rule | Detail |
|---|---|
| One place for each concern | Providers in `providers/providers.ts`; connection logic in `config/connections.ts`; VPN inside addresses in `config/vpn/addressPlan.ts`; regions in `config/<cloud>/common.ts` |
| Names come from config | Every resource and sub-resource name is set in the config file of its feature. Omitted names fall back to `<PROJECT_NAME>-<cloud>-<type>[-<key>]` (`utils/naming.ts`) |
| Stable construct IDs | Construct IDs (Terraform addresses) are built from `key ?? name` with `idPart()` (`utils/naming.ts`) and never from list positions, so adding, removing or reordering config entries does not change other resources. Set `key` to the old name to rename a resource without replacing it |
| Explicit dependencies | Use `addTerraformDependency()` (`utils/terraformDependency.ts`). `node.addDependency()` is **not** rendered into `depends_on` by cdktn |
| Pair logic stays explicit | Pairwise processing (VPN) is one module per pair; the code only shares the wiring |
| Constructs do not decide | Enable/disable decisions belong to `clouds/` and `resources/` |

## Testing

| Test | What it checks |
|---|---|
| `__tests__/synth-matrix.test.ts` | Synthesizes every `vpnMode` × VPN connection pattern for two feature sets (current config, everything enabled) and checks: no dependency cycles, valid `depends_on`, VPN pairs match the flags, Azure BGP addresses exist on the gateway |
| `__tests__/addressPlan.test.ts` | VPN inside addresses: /30 host addresses, no overlap, Azure APIPA range |
| `__tests__/construct-ids.test.ts` | Reversing the config lists keeps every Terraform address; renaming with `key` set to the old name keeps the address |
| `scripts/dev/synth-matrix.ts` | Before/after comparison of the synthesized output for refactoring |
