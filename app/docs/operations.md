# Operations

Deploy / destroy procedures and known issues. Run all commands inside the
`cdktn-backend` container from `/app`.

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
  different `bucketId` in `config/google/cloudlogging.ts`. The bucket location
  cannot be changed after creation, and retention beyond 30 days is charged.
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
