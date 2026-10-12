# Operations

[日本語](operations.ja.md)

Deploy / destroy procedures and known issues. Run all commands inside the
`cdktn-backend` container of the environment, from `/app`
(see getting-started.md, "Environments").

## Environments

Each container works on one environment (`DEPLOY_ENV`, set when the container
is started) with that environment's credentials (`.env.<env>`), settings
(`byEnv` in `config/`) and state (`state/<env>/terraform.tfstate`).

```bash
# on the host
DEPLOY_ENV=stg docker compose -p cdktn-stg up -d
docker compose -p cdktn-stg exec cdktn-backend bash
# in the container
echo "$DEPLOY_ENV"   # check the environment before diff / deploy / destroy
```

Run only one environment at a time: the containers share `app/` and its
`cdktf.out/`.

### Move the state of an existing deployment

Deployments made before environments were introduced keep their state in
`terraform.app.tfstate`. Decide which environment the deployment becomes,
make sure that environment's settings produce no changes, then move the
files (in the container, nothing running):

```bash
ENV=dev
mkdir -p "state/$ENV"
mv terraform.app.tfstate "state/$ENV/terraform.tfstate"
[ -f terraform.app.tfstate.backup ] && mv terraform.app.tfstate.backup "state/$ENV/terraform.tfstate.backup"
cdktn diff   # in the container of that environment: expect no changes
```

Also move the credentials (repository root `.env`) and the secrets
(`config/.env`) into `.env.<env>` (template: `.env.ENV.sample`), keeping only
the tool versions in `.env`.

## Deploy

```bash
cdktn diff     # always review the plan first
cdktn deploy
```

## Destroy

```bash
cdktn destroy
```

Some managed services release resources asynchronously, so a destroy may stop
with errors even though the dependency order is correct. Check the known issues
below and run `cdktn destroy` again when indicated.

## Logging

Logs are switched on / off per resource with `logs`, and their retention is
set where they are stored.

| Cloud | Resource | Switch | Stored in | Retention |
|---|---|---|---|---|
| AWS | VPN tunnels | `customerGateways.<peer>.logs` (`config/aws/vpn.ts`) | Log group (`logGroupName`) | Per log group (`config/aws/cloudwatchlogs.ts`) |
| AWS | ECS | Always on | Log group (`cloudwatchLogGroupName`) | Per log group |
| Google Cloud | VPN gateways and Cloud Routers | `logs` / `logBucket` (`config/google/vpn.ts`) | Log bucket (`config/google/cloudlogging.ts`) | Per log bucket (`retentionDays`) |
| Google Cloud | Cloud Run | `logs` / `logBucket` per service (`config/google/cloudrun.ts`) | Log bucket | Per log bucket |
| Azure | VPN gateway | `logs` (`config/azure/vpn.ts`) | Log Analytics Workspace, `AzureDiagnostics` table | Per table (`azureMonitorConfig.tableRetention`) |
| Azure | Container Apps environments | `azureAcaEnvironmentDefaults` / `azureAcaEnvironmentSettings` (`config/azure/containerapps.ts`) | Log Analytics Workspace, `ContainerAppConsoleLogs` / `ContainerAppSystemLogs` | Per table |

- Google Cloud: with `logs: true` the logs are routed to the log bucket and
  excluded from the `_Default` bucket, so they are stored (and charged) once.
  With `logs: false` they are only excluded (not stored).
- Google Cloud: a deleted log bucket stays in `DELETE_REQUESTED` for 7 days and
  its ID cannot be reused. To deploy again within 7 days of a destroy, set a
  different `bucketId` in `config/google/cloudlogging.ts`, or restore the
  bucket within the 7 days (`gcloud logging buckets undelete <bucket ID>
  --location=<location>`, then `terraform untaint` the bucket if the failed
  deploy marked it tainted). For environments that are destroyed and deployed
  again often (as `dev` by default), set `googleUseLogBuckets` to `false`: logs then stay in the
  `_Default` bucket (30 days) and no log buckets are created. The bucket
  location cannot be changed after creation, and retention beyond 30 days is
  charged.
- Azure: VPN gateway logs only support the shared `AzureDiagnostics` table, so
  its retention applies to every resource that sends logs in "Azure
  diagnostics" mode. Removing an entry from `tableRetention` resets the table
  to the workspace retention.
- AWS: changing `logOutputFormat` (`text` / `json`) of existing VPN tunnels
  interrupts each tunnel for several minutes. ECS Container Insights
  (`awsEcsClusterSettings` in `config/aws/ecs.ts`) and the awslogs mode
  (`logMode` / `logMaxBufferSize` per service) use the account settings unless
  set.

## Autoscaling

Scaling is set per workload in its config file.

| Cloud | Config | Settings |
|---|---|---|
| AWS ECS | `autoScaling` per service (`config/aws/ecs.ts`) | `minCapacity` / `maxCapacity`, target tracking on `cpuThreshold` / `memoryThreshold` (%) and `requestCountPerTarget` (ALB requests per task; ROLLING deployments with `targetGroupName` on an ALB only), cooldowns |
| Google Cloud Run | per service (`config/google/cloudrun.ts`) | `minInstances` / `maxInstances`, `maxInstanceRequestConcurrency` (default 80). Cloud Run scales on CPU utilization and concurrency; the CPU target cannot be set |
| Azure Container Apps | per app (`config/azure/containerapps.ts`) | `minReplicas` / `maxReplicas`, `scaleRules` (`http` / `tcp`: concurrent requests, `cpu` / `memory`: utilization %). Without rules: HTTP, 10 concurrent requests per replica. CPU / memory rules cannot scale to zero |

## Log archive

Container logs are archived to object storage per cloud when
`clouds.<cloud>.features.logArchive` is enabled. The bucket / storage account
name is required (globally unique) and lifecycle rules move old logs to cheaper
storage and delete them.

| Cloud | Config | How | Archived logs |
|---|---|---|---|
| AWS | `awsLogArchiveConfig` (`config/aws/monitoring.ts`) | `mode: "firehose"`: subscription filter → Firehose → S3 (continuous, `<prefix>/YYYY/MM/DD/HH/`, gzip). `mode: "export"`: EventBridge Scheduler → Lambda (`assets/lambda/cwl-export`) → export task → S3 (daily, `<prefix>/YYYY/MM/DD/`) | `logGroups` (names from `cloudwatchlogs.ts`) |
| Google Cloud | `googleLogArchiveConfig` (`config/google/monitoring.ts`) | Log sink → Cloud Storage (hourly batches) | Cloud Run services (`cloudRunServices`, default: all built) or `filter` |
| Azure | `azureLogArchiveConfig` (`config/azure/azuremonitor.ts`) | Diagnostic settings of the Container Apps environments → storage account (`insights-logs-<category>`, hourly) | Environments with `logs: true` (`acaEnvironments`, default: all) |

- `deleteOnDestroy: true` (default) deletes the archive with its contents on
  destroy. With `false`, S3 / Cloud Storage keep `force_destroy = false` and
  the Azure storage account gets `prevent_destroy`: destroy then fails (while
  the bucket is not empty on AWS / Google Cloud). To keep the archive, remove
  it from the state before destroying.
- AWS `export` mode: each run exports the last full UTC day that ended at least
  12 hours ago (log data can take up to 12 hours to become exportable). Export
  tasks run one at a time per account; the Lambda stops after 15 minutes, so
  keep the number of log groups small or use `firehose`.
- AWS `firehose` mode: a log group can have at most 2 subscription filters.
- Azure: the archive storage account accepts HTTPS only (TLS 1.2 or later) and
  is encrypted at rest with Microsoft-managed keys. `infrastructureEncryption:
  true` adds double encryption; it can only be set when the account is created
  (changing it replaces the account and deletes the archived logs).

## Alerting

Alerting is created per cloud when `clouds.<cloud>.features.alerting` is
enabled in `config/commonsettings.ts`. All lists are empty by default; each
config file contains a commented example.

| Cloud | Config | Notification targets | Alarms |
|---|---|---|---|
| AWS | `config/aws/monitoring.ts` (`awsAlertingConfig`) | `notificationTargets` (one SNS topic per target, one email subscription per address) | `metricFilters` (log groups from `cloudwatchlogs.ts`), `alarms` |
| Google Cloud | `config/google/monitoring.ts` (`googleAlertingConfig`) | `notificationTargets` (one email notification channel per address) | `logMetrics`, `alertPolicies` |
| Azure | `config/azure/azuremonitor.ts` | `azureMonitorConfig.actionGroups` | `azureAlertingConfig.logAlerts` (scheduled query rules, v2 API), `azureAlertingConfig.metricAlerts` |

- Alarms reference notification targets by `key` in `notify`. AWS alarms also
  notify on recovery with `notifyOnOk: true`.
- Alarm targets are written with config names (AWS: metric dimensions such as
  `ClusterName` / `ServiceName`, Google Cloud: label filters such as
  `resource.labels.service_name`, Azure: `target: { type: "containerApp", name }`).
  Unknown keys or names stop the synthesis with an error.
- Azure log alerts run against the Log Analytics Workspace of
  `azureMonitorConfig` unless `scopes` is set.

### AWS — confirm email subscriptions

SNS sends a confirmation email to each address after `cdktn deploy`. The
subscription stays `PendingConfirmation` and receives no alarms until the
recipient clicks the link in that email. Check the state in the SNS console
(Topics → the topic → Subscriptions). Terraform cannot confirm subscriptions.

## Secrets

The database passwords used by the API and by logical replication (FEAT-01)
are kept in each cloud's secret store. They are created when
`clouds.<cloud>.features.dbs` is enabled. cdktn creates only the store and a
dummy value; the real values are set from the work VMs with the cloud CLIs,
signed in with your own account. Terraform does not change the values
afterwards.

| Cloud | Store | Created by cdktn | Real value | Config |
|---|---|---|---|---|
| AWS | Secrets Manager | Secrets with the value `CHANGE_ME` | `aws secretsmanager put-secret-value` | `config/aws/secrets.ts` |
| Google Cloud | Secret Manager | Secrets with a first version `CHANGE_ME` | `gcloud secrets versions add` (new version) | `config/google/secrets.ts` |
| Azure | Key Vault (private endpoint only) | The vault and the role assignments; **no secrets** | `az keyvault secret set` (from the Azure VM only) | `config/azure/secrets.ts` |

Secret names (default names; see the config files):

| Secret | AWS | Google Cloud | Azure (Key Vault `multicloud-kv-001`; `-stg` / `-prod` appended in other environments) |
|---|---|---|---|
| API role password (`DB_PASSWORD`) | `multicloud-aws-secret-db-api-password` | `multicloud-google-secret-db-api-password` | `db-api-password` |
| Replication role password | `multicloud-aws-secret-db-repl-password` | `multicloud-google-secret-db-repl-password` | `db-repl-password` |

The values passed to cdktn (`CHANGE_ME`, and the database admin passwords in
`.env.<env>`) are kept in the Terraform state; keep the state on the work
machine only.

### Prerequisites

- A work VM exists in each cloud whose secrets you set: enable
  `clouds.<cloud>.features.vms` in `config/commonsettings.ts` and deploy. The
  Azure Key Vault is reachable only through its private endpoint, so the Azure
  values can only be set from the Azure VM (inside the VNet). You can disable
  `vms` again afterwards.
- The work VMs have the AWS CLI v2, the Google Cloud CLI and the Azure CLI
  (installed by `scripts/vm_init.sh` when the VM is created). Check with
  `aws --version`, `gcloud --version`, `az version`.
- Your account has these permissions:
  - AWS: `secretsmanager:PutSecretValue` and `secretsmanager:GetSecretValue`
    on the secrets.
  - Google Cloud: `roles/secretmanager.secretVersionAdder` and
    `roles/secretmanager.secretAccessor` (Secret Manager API enabled, see
    getting-started.md).
  - Azure: `Key Vault Secrets Officer` on the vault. cdktn assigns it to the
    identity that runs cdktn and to the object IDs in
    `secretsOfficerPrincipalIds` (`config/azure/secrets.ts`).

### Sign in and out on a VM

Sign in with your own account. The commands print a URL; open it in the
browser on your own machine, sign in, and paste the code back when asked.
Sign out when you finish: the credentials are cached in your home directory
on the VM.

| Cloud | Sign in | Sign out |
|---|---|---|
| AWS (console sign-in) | `aws login --remote --region ap-northeast-1` | `aws logout` |
| AWS (IAM Identity Center) | `aws configure sso` (first time), then `aws sso login --use-device-code` | `aws sso logout` |
| Google Cloud | `gcloud auth login --no-launch-browser`, then `gcloud config set project <project-id>` | `gcloud auth revoke --all` |
| Azure | `az login --use-device-code`, then `az account set --subscription <subscription-id>` | `az logout` |

### Set the values (first time and when changing a password)

Do this on each cloud's VM, signed in to that cloud only. The password is
written to a file readable only by you (so that it does not appear in the
shell history or the process list) and deleted at the end.

```bash
umask 077
# Generate one password per secret (letters and digits, 32 characters)
gen() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32; }
gen > ~/db-api-password
gen > ~/db-repl-password
```

AWS VM:

```bash
for s in db-api-password db-repl-password; do
  aws secretsmanager put-secret-value --region ap-northeast-1 \
    --secret-id "multicloud-aws-secret-$s" --secret-string "file://$HOME/$s"
done
```

Google Cloud VM:

```bash
for s in db-api-password db-repl-password; do
  gcloud secrets versions add "multicloud-google-secret-$s" --data-file="$HOME/$s"
done
```

Azure VM (the vault is reachable only from the Azure VNet):

```bash
for s in db-api-password db-repl-password; do
  az keyvault secret set --vault-name multicloud-kv-001 --name "$s" \
    --file "$HOME/$s" --encoding utf-8 --output none
done
```

Then delete the files and sign out:

```bash
shred -u ~/db-api-password ~/db-repl-password
```

After changing a password, run the role setup again (next section) so that
the database uses the new value, then restart the API on that cloud.

### Use the values for the database scripts

The database scripts of the application repository (`scripts/migrate.sh`,
`scripts/api-role-setup.sh`, `scripts/replication-setup.sh`) need the
passwords of every participating database, because each database connects to
the others. Run them on the Azure VM (the only place that can read the Key
Vault), signed in to all three clouds, and export the values instead of
writing them to `replication/nodes.env`:

```bash
export NODE_AWS_API_PASSWORD="$(aws secretsmanager get-secret-value --region ap-northeast-1 \
  --secret-id multicloud-aws-secret-db-api-password --query SecretString --output text)"
export NODE_AWS_REPL_PASSWORD="$(aws secretsmanager get-secret-value --region ap-northeast-1 \
  --secret-id multicloud-aws-secret-db-repl-password --query SecretString --output text)"
export NODE_GOOGLE_API_PASSWORD="$(gcloud secrets versions access latest \
  --secret=multicloud-google-secret-db-api-password)"
export NODE_GOOGLE_REPL_PASSWORD="$(gcloud secrets versions access latest \
  --secret=multicloud-google-secret-db-repl-password)"
export NODE_AZURE_API_PASSWORD="$(az keyvault secret show --vault-name multicloud-kv-001 \
  --name db-api-password --query value --output tsv)"
export NODE_AZURE_REPL_PASSWORD="$(az keyvault secret show --vault-name multicloud-kv-001 \
  --name db-repl-password --query value --output tsv)"
# Database admin passwords (.env.<env> of cdktn): typed, not echoed
for n in AWS GOOGLE AZURE; do
  read -rsp "NODE_${n}_ADMIN_PASSWORD: " v && echo && export "NODE_${n}_ADMIN_PASSWORD=$v"
done
```

Then run the scripts in the application repository (see its documentation),
and sign out of the three clouds when done. Leave out the clouds that do not
take part in the replication.

### Update the cloud CLIs

`gcloud` and `az` are updated with `sudo apt update && sudo apt upgrade`. The
AWS CLI is updated by running the installer again (Google Cloud VMs do this on
every boot, as `scripts/vm_init.sh` is their startup script):

```bash
cd "$(mktemp -d)"
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o awscliv2.zip
unzip -q awscliv2.zip && sudo ./aws/install --update
```

## Known issues

### Google Cloud — Cloud Run: subnet cannot be deleted (wait 1-2 hours, then destroy again)

```
Error 400: The subnetwork resource '.../subnetworks/<vpc>-app-subnet' is already being used by
'.../addresses/serverless-ipv4-...', resourceInUseByAnotherResource
```

Cloud Run Direct VPC egress reserves internal IP addresses (`serverless-ipv4-*`)
that are not managed by Terraform. Google Cloud releases them **1-2 hours after
the Cloud Run service is deleted**, and the subnet (and therefore the VPC)
cannot be deleted before that.

Run `cdktn destroy` again 1-2 hours after the first attempt; the remaining
subnet and VPC are then deleted.
Reference: [Direct VPC egress with a VPC network](https://cloud.google.com/run/docs/configuring/vpc-direct-vpc)

### Google Cloud — Regional load balancer: proxy-only subnet in use

```
Error 400: The subnetwork resource '.../subnetworks/<vpc>-proxy-subnet' is already being used by
'.../forwardingRules/<lb>-http-fw', resourceInUseByAnotherResource
```

The forwarding rule must be deleted before the proxy-only subnet. The
application declares this order explicitly and waits 240 seconds before the
subnet is deleted. If the error still occurs, run `cdktn destroy` again.

### Google Cloud — Cloud SQL: Private Service Access connection cannot be deleted

Deleting the Private Service Access (service networking) connection can fail
while Cloud SQL is being deleted
([terraform-provider-google#16275](https://github.com/hashicorp/terraform-provider-google/issues/16275)).

If it happens:

1. Release the Private Service Access connection of the VPC
   (VPC network → Private service access).
2. Run `cdktn destroy` again.
3. Delete the remaining VPC peering of the VPC network if it still exists.

### Azure — Container Apps: first destroy fails

Destroying Container Apps can fail on the first attempt. Run `cdktn destroy`
again.

### AWS — ECR: repository not empty

```
Error: ECR Repository (<name>) not empty, consider using force_delete: ... RepositoryNotEmptyException
```

CI/CD pushes images to the ECR repository, and a repository with images
cannot be deleted. `ecr.forceDelete` (`config/aws/cicd/cicdsettings.ts`,
default `true`) deletes the images with the repository. It takes effect after
a `cdktn deploy`: a repository deployed before this setting existed (or with
`false`) must be deleted by hand, then destroy again:

```bash
aws ecr delete-repository --repository-name <name> --force --region ap-northeast-1
cdktn destroy
```

### AWS — Aurora / RDS: CloudWatch log groups remain

Aurora / RDS recreate their CloudWatch log groups while being deleted, so the
following log groups can remain after `destroy`. Delete them manually:

```
RDSOSMetrics
/aws/rds/cluster/<cluster-name>/audit
/aws/rds/cluster/<cluster-name>/error
/aws/rds/cluster/<cluster-name>/slowquery
/aws/rds/instance/<instance-name>/audit
/aws/rds/instance/<instance-name>/postgresql
```
