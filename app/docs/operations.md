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

## Build an environment

A first deployment (or a deployment after a destroy): the infrastructure
steps here, with the application repository's steps in between (its
getting-started, "Overview").

`cdktn deploy` runs three times, because two settings can be turned on only
after work outside cdktn. The **build stage** of the environment selects
them (`config/buildstage.ts`). Set it in the cdktn container with
`npm run build-stage -- <stage>`; `npm run build-stage` shows it. It is
kept in `state/<env>/build-stage.json`, next to the Terraform state (not in
Git); without the file the stage is 1.

| Stage | Deploy | API container settings (`config/apicontainer.ts`) | Why not earlier |
|---|---|---|---|
| 1 | 1st (step 3) | `azureSecretReady`, `readinessProbe` and `journalPrune.enabled` off | — |
| 2 | 2nd (step 5), after the secrets | `azureSecretReady` on | The Azure Container App cannot start without the Key Vault secret, which can be set only after the 1st deploy created the vault (from inside the VNet; cdktn cannot create it, unlike the dummy values of AWS and Google Cloud) |
| 3 | 3rd (step 8), after CI/CD has deployed the API on every cloud | All three on | The placeholder images answer only `/` (health checks on `/readyz` would fail). The journal pruning jobs are created here as well, so that they start with the API's image |

Only `readinessProbe` strictly needs the 3rd deploy. The pruning jobs could
be created earlier (AWS and Google Cloud from the 1st deploy, Azure from the
2nd, since its job needs the Key Vault secret): they would start with the
placeholder image, and CI/CD switches them to the API's image. But a
scheduled run before the API is deployed would fail, so they come with
`readinessProbe`.

| # | Step | Where |
|---|---|---|
| 1 | One-time preparation: `.env.<env>` (including `AZURE_KEYVAULT_SECRETS_OFFICER_IDS`, your object ID for the Key Vault), the cloud permissions and APIs | [getting-started.md](getting-started.md) |
| 2 | `npm run build-stage` shows stage 1 (`npm run before-destroy` sets it back; otherwise `npm run build-stage -- 1`). After a destroy, also change the names that cannot be reused yet ("Deploy again after a destroy" below) | cdktn container, config files |
| 3 | `cdktn diff`, then `cdktn deploy` ("Deploy" below) | cdktn container |
| 4 | Set the passwords on every cloud: `scripts/secrets-set.sh <cloud>` (application repository; "Secrets" below) | AWS and Google Cloud: Cloud Shell or their VM; Azure: its VM |
| 5 | `npm run build-stage -- 2`, then `cdktn deploy` | cdktn container |
| 6 | Set up the databases (application repository, getting-started): a cluster with `scripts/cluster-setup.sh <cloud>` on one VM, clouds alone with `scripts/node-setup.sh <cloud>` on each cloud's VM | VM |
| 7 | Deploy the API: right after the infrastructure is built there is no new commit to merge and the registries are empty, so run each cloud's pipeline once (application repository: getting-started, "Deploy"). Pipelines: `api-service-cicd` (`config/aws/cicd/cicdsettings.ts`), `github-push-trigger` (`config/google/cicdsettings.ts`), `multicloud-api-deploy` (`config/azure/cicd.ts`). The build results are emailed (Azure DevOps to the person who ran it; AWS and Google Cloud to `ALERT_EMAILS`, "Alerting" below) | Cloud Shell, Azure DevOps |
| 8 | `npm run build-stage -- 3`, then `cdktn deploy`: the load balancers and platforms use `/readyz` and `/healthz`, and the journal pruning jobs are created | cdktn container |

Later releases of the API need no `cdktn deploy`: merging into the
environment's branch is enough. The stage stays 3.

## Deploy

```bash
cdktn diff     # always review the plan first
cdktn deploy
```

## Destroy

```bash
npm run before-destroy   # removes from the state what is deleted with its parent
cdktn destroy
```

`before-destroy` (`scripts/before-destroy.sh`) removes the Azure PostgreSQL
server parameters from the Terraform state: destroying them resets them on
the server, which fails while the database has logical replication slots
("Azure — PostgreSQL: server parameter cannot be reset" below). They are
deleted with the server. Nothing is changed in the clouds.

Some managed services release resources asynchronously, so a destroy may stop
with errors even though the dependency order is correct. Check the known issues
below and run `cdktn destroy` again when indicated.

When one cloud has to wait (e.g. the Google Cloud subnet below, 1-2 hours),
Terraform stops at the first error and the other clouds' resources remain.
Destroy the other clouds first, then the waiting one later with
`cdktn destroy`:

```bash
cd /app/cdktf.out/stacks/app
# Azure (aws_ for AWS); the plan lists what is destroyed: answer yes
terraform destroy $(terraform state list | grep -E '^(azurerm_|azuredevops_)' | sed 's/^/-target=/')
```

Resources that depend on them (e.g. the other clouds' VPN connections to
Azure) are destroyed too; Terraform warns that the destroy is partial.

### Deploy again after a destroy

Some names cannot be reused for a while after their resource is deleted, and
the values stored in deleted resources are gone. Before `cdktn deploy`:

| # | What | Why / how |
|---|---|---|
| 1 | Google Cloud: change the Cloud SQL instance `name` (`config/google/cloudsql/cloudsql.ts`) | A deleted instance name cannot be reused for about a week. Use a new date and time suffix (e.g. `cloudsql-postgres-instance-2026-1018-1500`). Nothing else refers to the name: the API gets the instance's address at deploy time, and the private DNS name (`aRecordName`) stays. Commands that name the instance (e.g. `gcloud sql instances describe`) take the new name |
| 2 | Google Cloud: log bucket IDs, only when `googleUseLogBuckets` is `true` | A deleted bucket ID cannot be reused for 7 days ("Logging" above). dev keeps it `false` |
| 3 | Azure: the Key Vault name, only if the deploy fails because it exists | The provider purges the soft-deleted vault on destroy. If that did not happen (e.g. no purge permission), purge it: `az keyvault purge --name <vault name>` |
| 4 | Build stage 1: `npm run before-destroy` sets it back before the destroy (check with `npm run build-stage`) | The new Key Vault has no secret yet (a Container App referencing it cannot start), and the containers run the placeholder images until CI/CD deploys the API |

After the deploy, as on the first deployment: set the secrets again
("Secrets" below; the values were deleted with the stores), set the
database up again (application repository: getting-started, "Set up the
databases"), deploy the API (run the pipelines once, as above), and follow
the build stages (steps 4-8 of "Build an environment").

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
enabled in `config/commonsettings.ts`. The alerts go to the addresses in
`ALERT_EMAILS` of `.env.<env>` (comma-separated; kept out of this public
repository, `config/notifications.ts`); every cloud's notification target
`ops` uses them.

### What is monitored

| Alert | AWS | Google Cloud | Azure | Fires when |
|---|---|---|---|---|
| `api-errors` | Log metric filter on `/aws/ecs/api-service` (`"failed"`) and alarm | Log-based metric on the Cloud Run service and alert policy | Log alert on `ContainerAppConsoleLogs` of `backend-api-service` | The API logs an error within 5 minutes (e.g. `Readiness check failed: ...` when its database is unreachable or a migration is missing, `Idle connection to ... failed`) |
| `journal-prune-failed` | Same log group (the job runs the API task definition) | Log-based metric on the Cloud Run job | Log alert on the Container Apps job's logs | The daily journal pruning job failed (`Journal pruning failed: ...`) |
| `<load balancer>-5xx` | `HTTPCode_ELB_5XX_Count` and `HTTPCode_Target_5XX_Count` of the ALB | `request_count` of the regional load balancer with response code class 500 | `ResponseStatus` of the Application Gateway, `HttpStatusGroup` 5xx | 10 or more 5xx responses within 5 minutes (from the load balancer, e.g. no healthy API, or from the API) |
| Build results (with the `cicd` feature) | EventBridge rule on the CodeBuild project's state changes (`SUCCEEDED`, `FAILED`, `STOPPED`) to the SNS topic (`buildNotifications`) | Log-match alert policies on the Cloud Build logs: `cloud-build-succeeded` (`DONE`), `cloud-build-failed` (lines starting with `ERROR`); at most one email per 5 minutes each | — (Azure DevOps emails the person who ran the pipeline) | A CI/CD build ends |

The load balancer alerts are written for both the HTTP and the HTTPS load
balancer of each cloud; only the one that is built gets them, so switching
between them needs no change in the alerts.

When an alert fires, look at the API's logs: AWS CloudWatch Logs
`/aws/ecs/api-service`, Google Cloud Logging (Cloud Run service
`web-service-with-lb`, or the job `<PROJECT_NAME>-google-journal-prune`),
Azure Log Analytics `ContainerAppConsoleLogs`. The application repository's
operations guide describes the errors and what to do.

### Configuration

| Cloud | Config | Notification targets | Alarms |
|---|---|---|---|
| AWS | `config/aws/monitoring.ts` (`awsAlertingConfig`) | `notificationTargets` (one SNS topic per target, one email subscription per address) | `metricFilters` (log groups from `cloudwatchlogs.ts`), `alarms` |
| Google Cloud | `config/google/monitoring.ts` (`googleAlertingConfig`) | `notificationTargets` (one email notification channel per address) | `logMetrics`, `alertPolicies` |
| Azure | `config/azure/azuremonitor.ts` | `azureMonitorConfig.actionGroups` | `azureAlertingConfig.logAlerts` (scheduled query rules, v2 API), `azureAlertingConfig.metricAlerts` |

- Alarms reference notification targets by `key` in `notify`. AWS alarms also
  notify on recovery with `notifyOnOk: true`.
- Alarm targets are written with config names (AWS: metric dimensions such as
  `ClusterName` / `ServiceName`, or `loadBalancer: <ALB name>` for the ALB's
  `LoadBalancer` dimension; Google Cloud: label filters such as
  `resource.labels.service_name`, and `loadBalancer: <name>` to create the
  policy only with that load balancer; Azure: `target: { type: "containerApp"
  | "applicationGateway", name }`, with `dimensions` filters). Unknown keys or
  names stop the synthesis with an error.
- Azure log alerts run against the Log Analytics Workspace of
  `azureMonitorConfig` unless `scopes` is set.
- Google Cloud: an alert policy is created right after its log-based metric;
  if the deploy fails because the metric is not found yet, run it again.

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

The API role password is **the same on every node**: set the same value in
the `db-api-password` secret of every cloud. Each cloud's API container
reads it for `DB_PASSWORD` and every `DB_<NODE>_PASSWORD`
(`config/apicontainer.ts`; application repository: getting-started). The
replication password is also the same on every node.

Azure: the Container App references the Key Vault secret only when
`apiContainerConfig.azureSecretReady` is on (build stage 2 and later); a
Container App cannot start while a referenced secret does not exist. Deploy
at stage 1, set `db-api-password` from the Azure VM, then
`npm run build-stage -- 2` and deploy again.

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
    `AZURE_KEYVAULT_SECRETS_OFFICER_IDS` (`.env.<env>`, comma-separated; your
    own: `az ad signed-in-user show --query id -o tsv`). Add yours and deploy
    before setting the values: without it, `az keyvault secret set` fails
    with `ForbiddenByRbac`. The assignment can take a few minutes to apply.

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

Check that you are signed in before using the CLI, and watch for these:

| Cloud | Check | Pitfall |
|---|---|---|
| AWS | `aws sts get-caller-identity` | Always add `--remote`. Without it, the sign-in page redirects your own browser to `127.0.0.1` (connection refused) while the command on the VM keeps waiting; stop it with Ctrl+C and run it again with `--remote`. Without signing in, commands fail with `NoCredentials` |
| Google Cloud | `gcloud config list account` (your account, not `…-compute@developer.gserviceaccount.com`) | Until you sign in, gcloud uses the VM's default service account, whose access scopes do not allow these commands: `PERMISSION_DENIED: Request had insufficient authentication scopes` (`ACCESS_TOKEN_SCOPE_INSUFFICIENT`). Sign in; do not widen the VM's scopes |
| Azure | `az account show` | — |

### Set the values (first time and when changing a password)

Both passwords have **the same value on every cloud**:

- `db-api-password` (the API role, `app_api`): every API connects to every
  node (application repository, getting-started).
- `db-repl-password` (the replication role, `app_repl`): only the database
  scripts use it; with one value they can run on any one VM and read every
  password from that cloud's own secret store. Clouds that run alone
  (`apiContainerConfig.topology` `independent`) do not use it.

Choose the two values once and keep them (e.g. in your password manager):

```bash
openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32; echo   # run twice: API, replication
```

Then, on each cloud, signed in to that cloud's CLI only (AWS and Google
Cloud: Cloud Shell or their VM; Azure: its VM, the vault is reachable only
from the Azure VNet), run the application repository's script with the
cloud's name and paste the two values when asked:

```bash
git clone https://github.com/Otazoman/multipleclouds-api-app.git   # or git pull
cd multipleclouds-api-app
scripts/secrets-set.sh aws        # google / azure on the other clouds
```

It checks the sign-in, sets both secrets of that cloud (the values go
through a file readable only by you, not the shell history or the process
list), reads them back to check them and ends with `Done`. Enter at the
replication prompt leaves that secret unchanged. Sign out afterwards.

After changing a password, run the role setup again (next section) so that
the database uses the new value, then restart the API on that cloud.

### Use the values for the database scripts

The database scripts belong to the application repository: see its
getting-started ("Set up the databases"). For a cloud alone,
`scripts/node-setup.sh <cloud>` reads the API password from the cloud's
secret store when the cloud's CLI is signed in on the VM. For a cluster,
`scripts/cluster-setup.sh <cloud>` runs on one VM and reads both passwords
from that cloud's secret store; the databases reach each other by their
private DNS names (Cloud SQL through the peered DNS domains,
configuration/google.md).

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

### Azure — PostgreSQL: server parameter cannot be reset

Destroying a server parameter (e.g. `wal_level`) resets it on the server
and can fail with `InternalServerError` ("An unexpected error occured while
processing the request"), likely because resetting `wal_level` needs a
restart that cannot succeed while the database has logical replication
slots (a cluster). `npm run before-destroy` removes the parameters from the
state first (they are deleted with the server). If the error occurs anyway,
run `npm run before-destroy` and `cdktn destroy` again.

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
