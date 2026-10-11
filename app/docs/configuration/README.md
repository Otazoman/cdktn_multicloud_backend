# Configuration reference

[日本語](README.ja.md)

All settings live in `config/`. Nothing else needs to be edited to change what is deployed.

| Document | Covers |
|---|---|
| [common.md](common.md) | Environments, accounts, feature switches, VPN connections, naming, address plan, credentials and secrets (`.env.<env>`) |
| [aws.md](aws.md) | `config/aws/` |
| [google.md](google.md) | `config/google/` |
| [azure.md](azure.md) | `config/azure/` |

## How to read the tables

| Column | Meaning |
|---|---|
| Item | Property name as written in the config file |
| Description | What the setting does |
| Allowed values | Type or the values accepted. `string`, `number`, `boolean` are TypeScript types |
| Default | Value used when the item is omitted. **Required** means the item must be set. `—` means the feature is not used when omitted |
| Notes | Constraints, references to other files, impact of changing the value |

## Conventions used in every config file

| Convention | Description |
|---|---|
| `build: true / false` | A list entry (VM, database, load balancer, container service, ...) is created only when `build` is `true`. Keep an entry with `build: false` to switch it on later (for example, to add an instance to staging temporarily). Entries with `build: false` are never created and are not validated against other config |
| `byEnv({...})` | Gives a value per environment (`dev`, `stg`, `prod`). See [common.md](common.md#environments) |
| `name` | The real name of the resource in the cloud. When omitted where optional, a default name `<PROJECT_NAME>-<cloud>-<resource type>[-<key>]` is generated (see [common.md](common.md#naming)) |
| `key` | Optional. Fixes the Terraform address (construct ID) of a resource. Defaults to `name`. To rename a resource without replacing it, set `key` to the **old** name |
| References by name | Subnets, security groups, IAM roles, log groups, target groups, etc. are referenced by `name` (or `key`). A name that does not exist stops synth with an error |
| Secrets | Values that must not be committed are read from environment variables (`process.env.X`). They are set in `.env.<env>` |
| Features | Whether a feature is created at all is decided in `config/commonsettings.ts` (`clouds.<cloud>.features`). The per-feature config files are only read when the feature is on |

## How names are specified

The way a resource's real name is set depends on the resource group. Each table says which one applies.

| Pattern | Used for | Meaning |
|---|---|---|
| `name` only | AWS resources, VMs, most top-level resources | `name` is the real name and is also used for references |
| `name` + `resourceName` | Google Cloud VPC, subnets, firewall rules, proxy subnets; Azure subnets; AWS EFS access points | `name` is a logical name used for references from other files; `resourceName` is the real name in the cloud. When `resourceName` is omitted, the default name is generated (Azure subnets: `<PROJECT_NAME>-azure-subnet-<name>`) |
| `names: { ... }` | RDS / Aurora, Azure Files, ACR, Key Vault, Application Gateway, Cloud Load Balancing | Real names of the sub-resources created for one resource (subnet group, private endpoint, listener, ...). Omitted entries use the default name |
| `<thing>Names: [...]` / `{ <key>: name }` | VPN (customer gateways, tunnels, connections), DNS forwarding rules, Google log routes | Names listed in order (one per tunnel or gateway) or by key (domain, route). Omitted entries use the default name |

Changing a real name replaces the resource. To keep the Terraform address when renaming, set `key` to the old value (see above).
