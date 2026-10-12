# Common settings

[日本語](common.ja.md)

Files: `config/commonsettings.ts`, `config/environment.ts`, `config/naming.ts`, `config/vpn/addressPlan.ts`, and the repository-root `.env`, `.env.<env>`.

Do not import `commonsettings.ts` values directly in code; use `config/features.ts` (`isCloudEnabled`, `isFeatureEnabled`) and `config/connections.ts` (`vpnConnections`, `isConnected`).

## Environments

One container (and one `.env.<env>`) per environment; the environment is chosen with `DEPLOY_ENV` when the container is started (`DEPLOY_ENV=dev docker compose -p cdktn-dev up -d`).

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `DEPLOY_ENV` (environment variable) | Environment to deploy | `dev`, `stg`, `prod` (the list `ENVIRONMENTS` in `config/environment.ts`) | **Required** | Unset or unknown value stops synth. Set by `compose.yaml` |
| `ENVIRONMENTS` | List of environment names | array of strings | `["dev", "stg", "prod"]` | To add an environment: add it here, create `.env.<name>`, then fill every `byEnv` that has no `default` (a type error shows where) |
| `byEnv({...})` | Value per environment | Either all environments (`{ dev, stg, prod }`) or `{ default, <env>?: ... }` | — | Evaluated when the config file is loaded |
| `envScopedName(base, { hyphen })` | Name that must be unique per environment | `hyphen: false` for names that do not allow `-` | `hyphen: true` | `dev` keeps `base`; other environments get `-<env>` (or `<env>`). Used for Key Vault, ACR, Azure DB servers, Azure Files accounts |
| State file | Terraform state | `state/<env>/terraform.tfstate` | — | Local, ignored by Git. Contains secrets in plain text |

## Accounts (`accounts`)

Set the accounts of each environment so that credentials of one environment cannot change another. The providers refuse to run against another account.

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `accounts.awsAccountId` | AWS account ID | 12-digit string | — (not checked) | Passed to the AWS provider as `allowedAccountIds` |
| `accounts.azureSubscriptionId` | Azure subscription ID | GUID string | — (`ARM_SUBSCRIPTION_ID` is used) | Passed to the azurerm provider as `subscriptionId` |
| Google Cloud project | Project of the environment | `PROJECT_NAME` in `config/google/common.ts` (see [google.md](google.md)) | **Required** for each environment where Google Cloud is enabled | Empty value stops synth |

Example: `byEnv({ default: {}, stg: { awsAccountId: "123456789012", azureSubscriptionId: "..." } })`.

## Cloud and feature switches (`clouds`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `clouds.<aws\|google\|azure>.enabled` | Create the cloud's network and everything that depends on it | `boolean` | `true` for all clouds | `false` skips the cloud entirely, including its VPN ends |
| `...features.vms` | Virtual machines | `boolean` | `true` (all clouds) | |
| `...features.dbs` | Managed relational databases (and their secrets) | `boolean` | `false` (all clouds) | PostgreSQL only |
| `...features.storage` | File storage (EFS / Filestore / Azure Files) | `boolean` | `false` | |
| `...features.containers` | Managed containers and their load balancers | `boolean` | `false` | |
| `...features.cicd` | CI/CD | `boolean` | `false` | |
| `...features.dns` | Public DNS zones and records | `boolean` | `false` | When `false`, public zones and A records are not created. AWS-managed certificates need a public zone for validation, so they are not created either |
| `...features.alerting` | Notification targets and alarms / alert policies | `boolean` | AWS `false`, Google `false`, Azure `true` | |
| `...features.logArchive` | Archive container logs to object storage | `boolean` | `false` | The bucket / account names must be set in the cloud's monitoring config |

A feature is created when both the cloud and the feature are enabled. VPN connections do not affect these switches.

## Cross-cloud VPN

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `useVpn` | Create VPN resources at all | `boolean` | `true` | |
| `awsToGoogle` | Direct VPN between AWS and Google Cloud | `boolean` | `true` | |
| `awsToAzure` | Direct VPN between AWS and Azure | `boolean` | `true` | |
| `googleToAzure` | Direct VPN between Google Cloud and Azure | `boolean` | `true` | A cloud that has two direct connections acts as a hub for the other two (BGP, `haBgp` only) |
| `vpnMode` | VPN method | `"singleTunnel"`: one tunnel per connection, static routes (Classic VPN on Google Cloud). `"haBgp"`: two tunnels per connection, BGP (HA VPN) | `byEnv`: `dev` `singleTunnel`, `stg` `singleTunnel`, `prod` `haBgp` | See [VPN](../networking/vpn.md) |
| `hostZones` | Private DNS zones and cross-cloud DNS forwarding | `boolean` | `false` | |

### VPN address plan (`config/vpn/addressPlan.ts`, `haBgp` only)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `vpnAddressPlan.awsAzure.tunnels[i][t]` | BGP inside addresses of the AWS–Azure tunnels (`i`: Azure gateway instance, `t`: AWS tunnel) | `{ insideCidr, awsIp, azureIp }`, `/30` in `169.254.0.0/16` | `169.254.21.0/30`, `.21.4/30`, `.22.0/30`, `.22.4/30` | Both IPs must be hosts of the `/30`. Azure side must be within `169.254.21.0`–`169.254.22.255`. Checked by `__tests__/addressPlan.test.ts` |
| `vpnAddressPlan.googleAzure.tunnels[i]` | Same for Google–Azure | `{ insideCidr, googleIp, azureIp }` | `169.254.21.8/30`, `169.254.22.8/30` | `/30` ranges must not overlap across all pairs |
| `vpnAddressPlan.googleAzure.presharedKey` | Pre-shared key of the Google–Azure tunnels | string from `GOOGLE_AZURE_VPN_PRESHARED_KEY` | **Required** for Google–Azure | AWS–Google uses the addresses assigned by AWS (no entry) |

ASNs are set per cloud in each cloud's `vpn.ts`.

## CI/CD (`config/cicd.ts`)

Shared by the CI/CD of every cloud (feature `cicd`). The build definitions are in the application repository (`buildspec.yml`, `cloudbuild.yaml`).

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `appRepository.owner`, `appRepository.name` | GitHub repository of the application | strings | `Otazoman`, `multipleclouds-api-app` | `appRepositoryUrl` is built from it |
| `cicdTrigger.branches` | Branches whose pushes (merged pull requests) start the build | exact branch names, `byEnv` | `["main"]` for all environments | Turned into a regular expression per cloud |

## Naming

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `PROJECT_NAME` (`config/naming.ts`) | Prefix of generated default names | string | `multicloud` | Default name: `<PROJECT_NAME>-<cloud>-<resource type>[-<key>]`, adjusted to the resource's naming rules (characters, length). Not related to the Google Cloud `PROJECT_NAME` in `config/google/common.ts` |

## Credentials and secrets (repository root)

| File | Content |
|---|---|
| `.env` | Tool versions only (`NODE_VERSION`, `TERRAFORM_VERSION`, `OPENTOFU_VERSION`). Used for the image build and for `${}` in `compose.yaml` |
| `.env.<env>` | Credentials and secrets of one environment (copy `.env.ENV.sample`). Ignored by Git |

| Variable | Description | Used by | Notes |
|---|---|---|---|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | AWS credentials | AWS provider | Account must match `accounts.awsAccountId` when set |
| `ARM_SUBSCRIPTION_ID`, `ARM_CLIENT_ID`, `ARM_CLIENT_SECRET`, `ARM_TENANT_ID`, `ARM_ENVIRONMENT` | Azure service principal | azurerm provider | `ARM_ENVIRONMENT`: `public` etc. |
| `GOOGLE_CLOUD_KEYFILE_JSON` | Path of the service account key file inside the container | Google provider | One key per environment |
| `GOOGLE_CLOUD_PROJECT` | Project ID | Google provider | The project actually used is `PROJECT_NAME` in `config/google/common.ts` |
| `AWSDB_ROOT_USER`, `AWSDB_ROOT_PASSWORD` | Master user of RDS / Aurora | `config/aws/aurorards/aurorards.ts` | |
| `GOOGLEDB_ROOT_USER`, `GOOGLEDB_ROOT_PASSWORD` | Admin user of Cloud SQL | `config/google/cloudsql/cloudsql.ts` | |
| `AZUREDB_ROOT_USER`, `AZUREDB_ROOT_PASSWORD` | Admin user of Azure Database for PostgreSQL | `config/azure/azuredatabase/databases.ts` | |
| `AZURE_APPGW_SSL_CERT_PASSWORD` | Password of the PFX certificate | `config/azure/applicationgateway.ts` | Only for the HTTPS pattern that imports a PFX |
| `GOOGLE_AZURE_VPN_PRESHARED_KEY` | Pre-shared key | `config/vpn/addressPlan.ts` | |
| `ECS_WORKER_POSTGRES_PASSWORD` | Sample worker container password | `config/aws/ecs.ts` | |
| `AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID` | Object ID of the DevOpsInfrastructure service principal | `config/azure/cicd.ts` | Azure CI/CD only. Not secret, but tenant-specific: kept out of Git |

Quoting: Docker Compose reads `.env.<env>`. Wrap values that contain `$` in **single quotes** (otherwise `$...` is expanded, even inside double quotes), and values that contain ` #` in quotes.
