# Google Cloud configuration

[日本語](google.ja.md)

Directory: `config/google/` (re-exported by `googlesettings.ts`). Feature switches are in [common.md](common.md#cloud-and-feature-switches-clouds). Conventions (`build`, `key`, references by name) are in [README.md](README.md).

## Common (`common.ts`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `PROJECT_NAME` | Google Cloud project ID of the environment. Used by every resource's `project` and by the provider | project ID string, `byEnv` | `dev`: `multicloud-sitevpn-project`; `stg`, `prod`: empty | **Required** per environment. Empty stops synth when Google Cloud is enabled. Not the naming prefix `PROJECT_NAME` of `config/naming.ts` |
| `LOCATION` | Region | region code | `asia-northeast1` | |
| `PUBLIC_DOMAIN` | Public DNS domain. LB host names (`api.<domain>`), managed certificate domains and the public zone are built from it | domain string, `byEnv` | `googletest.tohonokai.com` for all environments | Used only with `features.dns` or HTTPS patterns |

## VPC (`vpc/vpc.ts`, `vpc/subnets.ts`, `vpc/firewallRules.ts`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `vpcName` | VPC name | string | `multicloud-gcp-vpc` | |
| `vpcCidrblock` | CIDR of the VPC (used for firewall and VPN routes) | CIDR | `10.1.0.0/16` | Must not overlap AWS / Azure |
| `vpcLabels` | Labels | map | — | |
| `subnets[]` | Subnets: `{ name, resourceName, cidr, region, labels? }` | | **Required** | Referenced by `name` (e.g. `app-subnet`). `resourceName` is the real name (the VPC name is prefixed when referenced by instances) |
| `proxySubnets[]` | Proxy-only subnets for regional LBs: `{ name, resourceName, cidr, region }` | | `10.1.110.0/24` | Needed by regional external Application LBs |
| `firewallIngressRules[]` | Ingress rules: `{ name, resourceName, permission: { protocol, ports? }, sourceRanges, priority }` | `protocol`: `tcp`, `udp`, `all`, ... | **Required** | Cross-cloud CIDRs and PostgreSQL (5432), NFS (2049, 111, 20048) are listed here |
| `firewallEgressRules[]` | Egress rules: same plus `destinationRanges` | | **Required** | |
| `natConfig.enable` | Cloud NAT | `boolean` | `true` | |
| `natConfig.name`, `ipName`, `routerName`, `region` | NAT, address and router names | string | | |

## GCE (`gce.ts`, `gceInstancesParams`, feature `vms`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `project` | Project | `PROJECT_NAME` | | |
| `instanceConfigs[].build` | Create | `boolean` | **Required** | |
| `name`, `key` | Instance name; address key | string | **Required**; key = `name` | |
| `machineType`, `zone` | Size and zone | strings | **Required** | |
| `tags`, `labels` | Network tags; labels | `string[]`; map | `tags` **required** | |
| `bootDiskImage`, `bootDiskSize`, `bootDiskType`, `bootDiskDeviceName` | Boot disk | image path; GiB; `pd-standard` etc.; string | **Required** | |
| `subnetworkName` | Subnet | subnet `name` | **Required** | |
| `serviceAccountScopes` | OAuth scopes of the default service account | URLs | **Required** | |
| `startupScriptPath` | Startup script | path | — | `./scripts/vm_init.sh` |

## Private Service Access (`psa.ts`, `googlePsaConfig`)

One peering connection with several non-overlapping reserved ranges.

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `psaConstructId` | Construct ID of the singleton | string | `google-psa` | Do not change after deploy |
| `isExisting` | Reference existing addresses instead of creating | `boolean` | `false` | |
| `serviceRanges.cloudSql[]` | Ranges for Cloud SQL | `{ rangeName, address, prefixLength, key? }` | `10.100.16.0/20` | |
| `serviceRanges.filestore[]` | Ranges for Filestore | same | `10.100.10.0/24`, `10.100.11.0/24` | `rangeName` must equal `reservedIpRange` in `filestore.ts`. A /29 is the minimum per BASIC instance |
| `serviceRanges.cloudbuild[]` | Range for the Cloud Build private pool | same | `10.110.0.0/16` | |

## Cloud SQL (`cloudsql/cloudsql.ts`, `cloudSqlConfig`, feature `dbs`) — PostgreSQL only

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `project` | Project | `PROJECT_NAME` | | |
| `instances[].build` | Create | `boolean` | **Required** | |
| `name` | Instance name | string | **Required** | A deleted name cannot be reused for about a week; the sample name has a date suffix |
| `aRecordName` | A record in the `google.inner` private zone | FQDN | — | |
| `edition` | Edition | `ENTERPRISE`, `ENTERPRISE_PLUS` | **Required** | `ENTERPRISE_PLUS` needs a `db-perf-optimized-*` tier |
| `databaseVersion` | Version | e.g. `POSTGRES_18` | **Required** | |
| `tier` | Machine tier | e.g. `db-custom-2-8192` | **Required** | |
| `region` | Region | | **Required** | |
| `availabilityType` | Availability | `ZONAL`, `REGIONAL` | **Required** | |
| `diskType`, `diskSize`, `diskAutoresize`, `diskAutoresizeLimit` | Disk | `PD_SSD`/`PD_HDD`; GiB; `boolean`; GiB | **Required** | |
| `username`, `password` | Admin user | from `GOOGLEDB_ROOT_USER`, `GOOGLEDB_ROOT_PASSWORD` | | |
| `managedPasswordEnabled` | Let Google manage the password | `boolean` | **Required** | |
| `privateNetwork` | Private IP through PSA | `boolean` | **Required** | |
| `authorizedNetworks` | Public networks allowed | CIDR list | **Required** (`[]`) | |
| `backupEnabled`, `backupStartTime`, `backupRetainedBackups`, `backupTransactionLogRetentionDays` | Backup | `boolean`; `HH:MM` (UTC); count; days | **Required** | |
| `pointInTimeRecoveryEnabled` | PITR | `boolean` | — | |
| `maintenanceWindowDay`, `maintenanceWindowHour`, `maintenanceUpdateTrack` | Maintenance | 1 (Mon)–7; 0–23; `stable`, `canary`, `week5` | **Required** | |
| `highAvailabilityEnabled` | HA | `boolean` | **Required** | |
| `insightsEnabled`, `queryStringLength`, `recordApplicationTags`, `recordClientAddress` | Query Insights | `boolean`; number; `boolean`; `boolean` | **Required** | |
| `deletionProtection` | Deletion protection | `boolean` | **Required** | `true` blocks destroy |
| `labels` | Labels | map | **Required** | |
| `databaseFlagsFile` | File with database flags | path | — | `postgres-parameters.ts` exports `postgresDatabaseFlags[]` `{ name, value }`. `cloudsql.logical_decoding=on` is set for active/active |

## Filestore (`filestore.ts`, `filestoreConfigs`, feature `storage`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `project` | Project | `PROJECT_NAME` | | |
| `instances[].build` | Create | `boolean` | **Required** | |
| `name`, `key` | Name; address key | string | **Required**; key = `name` | |
| `location` | Zone | e.g. `asia-northeast1-a` | **Required** | |
| `tier` | Tier | `BASIC_HDD`, `BASIC_SSD`, `HIGH_SCALE_SSD`, `ENTERPRISE`, `ZONAL`, `REGIONAL` | **Required** | |
| `fileShare.name`, `fileShare.capacityGb` | Share | string; GiB | **Required** | |
| `networkName` | VPC | `vpcName` | **Required** | |
| `connectMode` | Connection | `DIRECT_PEERING`, `PRIVATE_SERVICE_ACCESS` | provider default | |
| `reservedIpRange` | PSA range name | `rangeName` in `psa.ts` | — | |
| `aRecordName` | A record in `google.inner` | FQDN | — | |
| `labels` | Labels | map | — | |

## Secrets (`secrets.ts`, `googleSecretsConfig`, feature `dbs`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `project` | Project | `PROJECT_NAME` | | |
| `initialValue` | Dummy first version | string | `CHANGE_ME` | Kept in the state. Add the real value as a new version with `gcloud` (see [operations.md](../operations.md)) |
| `secrets[].key` | Key | string | **Required** | |
| `secrets[].name` | Secret ID | string | `<PROJECT_NAME>-google-secret-<key>` | |
| `secrets[].description` | Description | string | **Required** | |

## Containers (feature `containers`)

### Cloud Run (`cloudrun.ts`, `gcpRunConfigs[]`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build` | Create | `boolean` | **Required** | |
| `name`, `key` | Service name; address key | string | **Required**; key = `name` | |
| `project`, `location` | Project and region | | **Required** | |
| `image` | Container image | string | **Required** | |
| `port` | Container port | number | **Required** | |
| `cpu`, `memory` | Resources | `"1"`, `"0.5"`; `"512Mi"` | `"0.5"`, `"256Mi"` | |
| `minInstances`, `maxInstances` | Scaling | number | `0`, `3` | |
| `maxInstanceRequestConcurrency` | Concurrent requests per instance | number | `80` | |
| `cpuAlwaysAllocated` | CPU stays allocated between requests | `boolean` | `false` | |
| `allowUnauthenticated` | Public invoker (`allUsers`) | `boolean` | `false` | |
| `useLb` | Reachable only through a load balancer | `boolean` | `false` | `true`: ingress `INTERNAL_LOAD_BALANCER`; `false`: all traffic |
| `subnetworkName` | Direct VPC egress subnet | `resourceName` of a subnet | — | |
| `logs`, `logBucket` | Route logs to a log bucket | `boolean`; key in `cloudlogging.ts` | — | `logs: false` only excludes from `_Default` |

### Cloud Load Balancing (`cloudloadbalancing.ts`, `gcpLbConfigs[]`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build` | Create | `boolean` | **Required** | Keep HTTP, regional HTTPS and global HTTPS as separate entries and switch with `build` |
| `name`, `key` | LB name; address key | string | **Required**; key = `name` | |
| `names` | `staticIp`, `proxy`, `forwardingRule` names | strings | `<PROJECT_NAME>-google-lb-ip-<name>` etc. | |
| `project`, `region` | | | **Required** | |
| `loadBalancerType` | Scope | `"REGIONAL"`, `"GLOBAL"` | **Required** | Regional needs a proxy-only subnet |
| `protocol`, `port` | Frontend | `"HTTP"`, `"HTTPS"`; number | **Required** | |
| `reserveStaticIp` | Reserve an IP | `boolean` | **Required** | |
| `networkTier`, `loadBalancingScheme` | | `PREMIUM`; `EXTERNAL_MANAGED` | provider default | |
| `dnsConfig.subdomain`, `dnsConfig.fqdn` | Public zone and record | strings | — | Built from `PUBLIC_DOMAIN`. A record is created with `features.dns` |
| `managedSsl` | Certificate | `{ certificateName?, domains, certificatePath?, privateKeyPath? }` | — | Files given: uploaded self-managed certificate (regional). No files: Google-managed (global). Default name `<PROJECT_NAME>-google-ssl-certificate-<LB name>` |
| `sslCertificateNames` | Existing certificates | names | — | |
| `backends[]` | Backends | `{ name, key?, names?: { serverlessNeg?, healthCheck? }, protocol, loadBalancingScheme, timeoutSec?, cloudRunServiceName?, healthCheck?: { requestPath, port } }` | **Required** | `cloudRunServiceName` must match a built Cloud Run service |
| `defaultBackendName` | Default backend | `backends[].name` | **Required** | |
| `hostRules[]`, `pathMatchers[]` | Host / path routing | `{ hosts, pathMatcher }`; `{ name, defaultBackendName, pathRules: [{ paths, backendName }] }` | — | |
| `gcpPublicZoneNames` | Public zone resource name per domain | map | `<PROJECT_NAME>-google-public-zone-<domain>` | |

## CI/CD (`cicdsettings.ts`, `googleCicdConfigs[]`, feature `cicd`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build`, `name`, `project` | Create; pipeline name; project | | **Required** | |
| `artifactRegistry.repositoryId`, `location`, `format`, `description` | Artifact Registry | strings; `format`: `DOCKER` etc. | **Required** except `description` | |
| `cloudbuildPrivatePool.workerPoolName`, `location`, `key?` | Private pool | strings | **Required** | Needs the `cloudbuild` PSA range |
| `cloudbuildPrivatePool.machineType` | Machine type | string | `e2-standard-2` | |
| `cloudbuildPrivatePool.diskSizeGb` | Disk | GiB | `100` | |
| `cloudbuildPrivatePool.peeredNetworkIpRange` | Range inside the peering | CIDR or empty | provider chooses | |
| `githubTrigger.build` | Create the trigger | `boolean` | — | |
| `githubTrigger.name`, `key` | Trigger name; address key | string | **Required**; key = `name` | |
| `githubTrigger.connectionName` | Cloud Build GitHub connection (2nd gen) | name | **Required** | Created and approved with gcloud before the deploy, in the region of `cloudbuildPrivatePool.location` ([getting-started.md](../getting-started.md)) |
| `githubTrigger.repositoryName`, `remoteUri` | Repository linked to the connection | name; HTTPS URL | `appRepository` (`config/cicd.ts`) | |
| `githubTrigger.filename` | Build definition in the repository | path | `cloudbuild.yaml` | |
| `githubTrigger.serviceAccountId` | Service account the build runs as (created) | 6–30 characters | `cloudbuild-deployer` | Gets `logging.logWriter`, `cloudbuild.workerPoolUser` (project), `artifactregistry.writer` (repository) |
| `githubTrigger.deployTarget.cloudRunServiceName` | Cloud Run service the build deploys to | service `name` in `cloudrun.ts` (`build: true`) | — | Passed as `_SERVICE`; the service account gets `run.developer` on the service and `iam.serviceAccountUser` on the default compute service account. Terraform ignores the service's image. Without it, `cloudbuild.yaml` fails at its deploy step |
| Trigger branches | Pushes to these branches start the build | `cicdTrigger.branches` in `config/cicd.ts` | `main` | `_REGION`, `_AR_REPOSITORY`, `_WORKER_POOL` are always passed |
| `tags` | Labels | map | — | |

## Logging (`cloudlogging.ts`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `googleUseLogBuckets` | Route `logs: true` resources to the log buckets below | `boolean` | `true` | `false`: logs stay in `_Default` (30 days); useful for environments destroyed and deployed again within 7 days |
| `googleLogBucketsConfig[].key` | Key referenced by `logBucket` | string | **Required** | Only referenced buckets are created |
| `bucketId` | Bucket ID | string | `<PROJECT_NAME>-google-logs-<key>` | A deleted ID cannot be reused for 7 days |
| `location` | Location | region | **Required** | Cannot be changed after creation |
| `retentionDays` | Retention | 1–3650 | **Required** | More than 30 days is charged |
| `enableAnalytics` | Observability Analytics | `boolean` | `false` | Cannot be turned off once enabled |
| `googleLogRouteNames` | Sink and exclusion names per route (`vpn`, `cloudrun-<service>`) | `{ sinkName?, exclusionName? }` | `<PROJECT_NAME>-google-log-sink-<route>` / `-log-exclusion-<route>` | |

## Monitoring (`monitoring.ts`)

### Alerting (feature `alerting`, `googleAlertingConfig`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `notificationTargets[]` | E-mail channels | `{ key, name?, emails[] }` | `[]` | `name` default `<PROJECT_NAME>-google-alerts-<key>` |
| `logMetrics[]` | Log-based metrics | `GcpLogMetricDefinition` (see `constructs/observability/googlecloudmonitoring.ts`) | `[]` | Metric type `logging.googleapis.com/user/<name>` |
| `alertPolicies[]` | Alert policies | `GcpAlertPolicyDefinition` without `notificationChannels`, plus `notify?: string[]` | `[]` | `notify`: keys of `notificationTargets`. Example in the file header |

### Log archive (feature `logArchive`, `googleLogArchiveConfig`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `deleteOnDestroy` | Delete the bucket and logs on destroy | `boolean` | `true` | |
| `bucket.name` | Cloud Storage bucket | globally unique string | **Required** when `logArchive` is on | Use `byEnv` for per-environment names |
| `bucket.location` | Location | region | `LOCATION` | |
| `bucket.lifecycle` | Class change / deletion | `{ toArchiveClassDays?, deleteDays? }` | `30`, `365` | |
| `sinkName` | Log sink | string | `<PROJECT_NAME>-google-log-archive` | |
| `cloudRunServices` | Services to archive | names | every built service | |
| `filter` | Logging query used instead | string | — | |
| `labels` | Labels | map | — | |

## Private DNS (`privatezone.ts`, `googlePrivateZoneParams`, when `hostZones` is on)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `enableForwarding` | Forward other clouds' private domains | `boolean` | `true` | |
| `forwardingDomains` | Domains | strings | Azure PostgreSQL / Private Link / Azure Files domains, `azure.inner`, `aws.inner` | |
| `forwardingZoneNames`, `privateZoneNames` | Zone names per domain | map | `<PROJECT_NAME>-google-forwarding-zone-<domain>` / `-private-zone-<domain>` | Forwarding zone when the peer DNS is reachable, otherwise a private zone |
| `forwardingZoneDescription`, `privateZoneDescription`, `labels` | Descriptions and labels | | | |
| `inboundServerPolicyName` | Policy accepting queries from AWS / Azure | string | `gcp-resolver-inbound` | |
| `cloudSqlARecords`, `filestoreARecords` | Short-name zone `google.inner` | `{ internalZoneName, zoneResourceName, zoneDescription }` | `google.inner` | Both share one zone |

## VPN (`vpn.ts`, `googleVpnParams`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `logs`, `logBucket` | VPN and Cloud Router logs | `boolean`; key in `cloudlogging.ts` | `true`, `vpn` | |
| `vpnGatewayName`, `connectDestination` | Gateway name; label of the shared gateway | string | **Required** | |
| `gatewayIpName`, `forwardingRuleNames` | Single-tunnel (Classic VPN) address and rules `esp`, `udp500`, `udp4500` | string / map | | `singleTunnel` only |
| `haIpNames` | HA VPN addresses (two) | strings | | `haBgp` only |
| `peers.<aws\|azure>` | Names per peer: `externalGatewayName`, `tunnelNames`, `routeNames` (static routes, `singleTunnel` only), `routerInterfaceNames`, `routerPeerNames` | strings, used in order | `<PROJECT_NAME>-google-<type>-<peer>-<n>` | AWS has four tunnels (two connections × two tunnels) |
| `cloudRouterName` | Cloud Router | string | **Required** | |
| `bgpGoogleAsn` | Google-side BGP ASN | number | `65000` | |
| `ikeVersion` | IKE version | `1`, `2` | `2` | |
| `customIpRanges` | Ranges advertised by the router | CIDR list | `10.100.0.0/16`, `35.199.192.0/19` | Cloud SQL / Filestore (PSA) and Google DNS |
| `labels` | Labels | map | — | |
