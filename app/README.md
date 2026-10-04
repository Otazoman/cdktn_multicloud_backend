# Multi-Cloud Backend — cdktn application

This directory contains the cdktn (CDK Terrain) application that provisions the
multi-cloud backend on AWS, Google Cloud and Azure.

For setup, see [docs/getting-started.md](docs/getting-started.md).
For deploy / destroy procedures and known issues, see [docs/operations.md](docs/operations.md).
For the design, see [docs/architecture.md](docs/architecture.md),
[docs/networking/vpn.md](docs/networking/vpn.md) and
[docs/adding-a-cloud.md](docs/adding-a-cloud.md).

## Directory structure

| Path | Description |
|---|---|
| `app.ts` | Entry point |
| `stacks/` | The single stack `MultiCloudBackendStack` that wires everything together |
| `providers/` | Terraform provider declarations (the only place providers are created) |
| `clouds/` | Cloud registry (`registry.ts`), shared types (`types.ts`: per-cloud outputs and the `CloudContext` passed to cross-cloud modules) and one module per cloud (`aws/`, `azure/`, `google/`: `index.ts` for the foundations, one file per feature, `types.ts` for the cloud's types) |
| `config/` | All settings. `commonsettings.ts` holds the global switches (read through `features.ts` / `connections.ts`); `aws/`, `azure/`, `google/` hold per-cloud settings (regions in `common.ts`) |
| `resources/` | Cross-cloud orchestrators: VPN (`vpnResources.ts` + `vpn/`, one module per cloud pair) and private DNS (`privateZoneResources.ts` + `privatezone/`, one module per cloud) |
| `constructs/` | Resource definitions grouped by category (network, VPN, DB, storage, containers, ...) |
| `utils/` | Shared helpers (e.g. `addTerraformDependency`) |
| `scripts/` | VM startup script and development tools (`scripts/dev/`) |
| `__tests__/` | Tests |
| `docs/` | Documentation (`docs/ai/` contains internal working notes) |

Data flows in one direction: `config` → `clouds` / `resources` → `constructs`.

## Supported services

| Area | AWS | Google Cloud | Azure |
|---|---|---|---|
| Network | VPC | VPC | Virtual Network |
| VPN | Virtual Private Gateway | HA VPN / Classic VPN + Cloud Router | VPN Gateway |
| VM | EC2 | Compute Engine | Virtual Machines |
| Database | RDS / Aurora | Cloud SQL | Azure Database for MySQL / PostgreSQL (Flexible Server) |
| File storage | EFS | Filestore | Azure Files |
| Containers | ECS (Fargate) | Cloud Run | Container Apps |
| Load balancer | ALB | Cloud Load Balancing | Application Gateway |
| DNS | Route 53 | Cloud DNS | Azure DNS / Private DNS |
| CI/CD | CodeBuild + ECR | Cloud Build + Artifact Registry | Container Registry (ACR, private endpoint); Azure DevOps pipelines planned |
| Monitoring | CloudWatch | Cloud Monitoring | Azure Monitor |

## Commands

Run inside the container from this directory.

| Command | Description |
|---|---|
| `npm install` | Install dependencies |
| `cdktn synth` | Generate Terraform configuration into `cdktf.out/` |
| `cdktn diff` | Show the plan |
| `cdktn deploy` | Apply |
| `cdktn destroy` | Delete all resources (see [docs/operations.md](docs/operations.md)) |
| `npx tsc --noEmit -p .` | Type check |
| `npx jest __tests__/synth-matrix.test.ts` | Regression test: synthesizes every env × VPN connection pattern and checks invariants |

`__tests__/app-test.ts` compares against an old snapshot and currently fails; it
is kept for reference only.

### Comparing synthesized output (refactoring)

```bash
npx ts-node scripts/dev/synth-matrix.ts synth cdktf.out/before.json
# ...make changes...
npx ts-node scripts/dev/synth-matrix.ts synth cdktf.out/after.json
npx ts-node scripts/dev/synth-matrix.ts compare cdktf.out/before.json cdktf.out/after.json
```

The output files contain secrets from `config/.env`; keep them under `cdktf.out/`
(ignored by git) and never commit them.

## Terraform state

State is stored locally (`terraform.app.tfstate`, ignored by git). It contains
secrets in plain text — keep it out of version control and back it up securely.
