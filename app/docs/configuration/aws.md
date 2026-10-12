# AWS configuration

[日本語](aws.ja.md)

Directory: `config/aws/` (re-exported by `awssettings.ts`). Switches that turn features on or off are in [common.md](common.md#cloud-and-feature-switches-clouds). Conventions (`build`, `key`, references by name) are in [README.md](README.md).

## Common (`common.ts`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `REGION` | Region of all AWS resources | AWS region code | `ap-northeast-1` | |
| `PUBLIC_DOMAIN` | Public DNS domain. ALB host names (`api.<domain>`), certificates and the public zone are built from it | domain string, `byEnv` | `awstest.tohonokai.com` for all environments | Used only with `features.dns` or AWS-managed certificates. Set a different value per environment with `byEnv({ dev, stg, prod })` |

## VPC (`vpc/vpc.ts`, `vpc/subnets.ts`, `vpc/securitygroups.ts`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `vpcCidrBlock` | VPC CIDR | CIDR | `10.0.0.0/16` | Must not overlap the other clouds (sample values: Google Cloud `10.1.0.0/16`, Azure `10.2.0.0/16`) |
| `vpcName` | VPC name | string | `my-aws-vpc` | |
| `internetGatewayName` | Internet gateway name | string | `<PROJECT_NAME>-aws-igw` | |
| `vpcTags` | Tags of the VPC | map | — | |
| `defaultRouteTableName` | Name of the main route table | string | **Required** | |
| `ec2ICEndpoint.enable` | Create an EC2 Instance Connect endpoint | `boolean` | `true` | |
| `ec2ICEndpoint.endpointName` | Endpoint name | string | **Required** | |
| `ec2ICEndpoint.securityGroupNames` | Security groups of the endpoint | names in `securityGroups` | **Required** | |
| `natGateway.enable` | Create a NAT gateway | `boolean` | `true` | Has an hourly cost |
| `natGateway.name`, `natGateway.eipName`, `natGateway.tags` | Names and tags | string / map | `eipName`: `<PROJECT_NAME>-aws-nat-eip` | |
| `routeTables.public` / `routeTables.private` | Route tables | `{ name, associatedSubnetNames, tags? }` | **Required** | `associatedSubnetNames` must be subnet `name`s |

### Subnets (`subnets[]`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `name` | Subnet name | string | **Required** | Referenced by name from other files |
| `key` | Terraform address key | string | `name` | |
| `cidrBlock` | CIDR | CIDR inside the VPC | **Required** | |
| `az` | Availability zone | zone name | **Required** | |
| `type` | Public or private | `"public"`, `"private"` | **Required** | |
| `tags` | Tags | map | — | |

### Security groups (`securityGroups[]`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `name` | Group name | string | **Required** | Referenced by name |
| `key` | Terraform address key | string | `name` | |
| `resourcetype` | Purpose label | string (`ec2`, `rds`, `alb`, `ecs`, `code-build`, `other`) | **Required** | |
| `tags` | Tags | map | — | |
| `ingress[]`, `egress[]` | Rules | `{ fromPort, toPort, protocol, cidrBlocks, ipv6CidrBlocks?, description? }` | **Required** (may be `[]`) | `protocol: "-1"` means all. Cross-cloud CIDRs (`10.1.0.0/16`, `10.2.0.0/16`, `10.100.0.0/16`) are listed here |

Only PostgreSQL (5432) is opened in `myaws-db-sg`.

## EC2 (`ec2.ts`, `ec2Configs[]`, feature `vms`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build` | Create this instance | `boolean` | **Required** | |
| `key` | Terraform address key | string | `tags.Name` | |
| `ami` | AMI ID | string | **Required** | |
| `instanceType` | Instance type | string | **Required** | |
| `keyName` | Existing EC2 key pair | string | **Required** | |
| `tags` | Tags | map; `Name` is **required** | — | |
| `subnetKey` | Subnet | subnet `name` | **Required** | |
| `securityGroupIds` | Security groups | names in `securityGroups` | **Required** | |
| `diskSize` | Root volume size (GiB) | number | AMI default | |
| `userDataScriptPath` | User data script | path | — | `./scripts/vm_init.sh` |

## EFS (`efs.ts`, `efsConfigs[]`, feature `storage`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build` | Create | `boolean` | **Required** | |
| `name`, `key` | Name; Terraform address key | string | **Required**; key = `name` | |
| `encrypted` | Encryption | `boolean` | `true` | |
| `performanceMode` | Performance mode | `"generalPurpose"`, `"maxIO"` | AWS default | |
| `throughputMode` | Throughput mode | `"bursting"`, `"provisioned"`, `"elastic"` | AWS default | |
| `provisionedThroughputInMibps` | Throughput | number | — | With `provisioned` |
| `subnetKeys` | Mount target subnets | subnet `name`s | **Required** | One mount target per subnet |
| `securityGroupIds` | Security groups | names | **Required** | |
| `tags` | Tags | map; `Name` **required** | — | |
| `transitionToIa`, `backupPolicy` | Lifecycle and backup | `AFTER_7_DAYS` etc.; `ENABLED`, `DISABLED` | — | Listed in the sample config |
| `cnameRecordName` | CNAME registered in the `aws.inner` private zone | FQDN | — | See Private DNS |
| `accessPoints[]` | Access points | `{ name, key?, resourceName?, path?, posixUser?, creationInfo? }` | `[]` | `resourceName` default `<PROJECT_NAME>-aws-efs-access-point-<name>` |

## Databases (`aurorards/`, feature `dbs`) — PostgreSQL only

`rdsConfigs[]` (RDS instance) and `auroraConfigs[]` (Aurora cluster).

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build` | Create | `boolean` | **Required** | |
| `identifier` / `clusterIdentifier` | Instance / cluster identifier | string | **Required** | |
| `key` | Terraform address key | string | identifier | |
| `names` | Names of generated resources | `{ subnetGroup, parameterGroup, optionGroup, clusterParameterGroup, instanceParameterGroup, instances[] }` | default name | `instances[]`: one per instance, in order |
| `engine` | Engine | `"postgres"` (RDS), `"aurora-postgresql"` (Aurora) | **Required** | MySQL / MariaDB are not supported |
| `engineVersion` | Engine version | string | **Required** | |
| `instanceClass` | Instance class | string | **Required** | |
| `instanceCount` | Aurora instances | number | `1` | Aurora only |
| `allocatedStorage`, `storageType` | Storage | GiB; `gp3` etc. | — | RDS only |
| `username` / `masterUsername`, `password` | Master user | from `AWSDB_ROOT_USER`, `AWSDB_ROOT_PASSWORD` | — | |
| `manageMasterUserPassword` | Let AWS keep the password in Secrets Manager | `boolean` | `false` in samples | When `true`, `password` is not used |
| `subnetKeys` | DB subnet group subnets | subnet `name`s | **Required** | |
| `vpcSecurityGroupNames` | Security groups | names | **Required** | |
| `parameterGroupFamily`, `parameterGroupParametersFile` | RDS parameter group and its parameter file | family e.g. `postgres18`; path | — | The file exports `postgresParameters[]` `{ name, value, applyMethod: "immediate" \| "pending-reboot" }` |
| `dbClusterParameterGroupFamily`, `dbClusterParameterGroupParametersFile` | Aurora cluster parameter group | family e.g. `aurora-postgresql18`; path | — | `rds.logical_replication` is set for active/active |
| `instanceParameterGroupFamily`, `instanceParameterGroupParametersFile` | Aurora instance parameter group | | — | |
| `skipFinalSnapshot` | Skip the snapshot on delete | `boolean` | **Required** | |
| `backupRetentionPeriod` | Backup days | number | `7` | |
| `preferredBackupWindow`, `preferredMaintenanceWindow`, `instancePreferredMaintenanceWindow` | Windows (UTC) | `hh:mm-hh:mm`; `ddd:hh:mm-ddd:hh:mm` | AWS default | Last one: Aurora instances |
| `enablePerformanceInsights`, `performanceInsightsRetentionPeriod` | Performance Insights | `boolean`; days | — | |
| `enableEnhancedMonitoring`, `monitoringInterval`, `monitoringRoleName` | Enhanced Monitoring | `boolean`; seconds; role name in `iam.ts` | interval `60` | Interval is `0` when disabled |
| `enabledCloudwatchLogsExports` | Log types exported to CloudWatch | e.g. `["postgresql", "upgrade"]` | — | Each needs a log group named `/aws/rds/instance/<identifier>/<type>` or `/aws/rds/cluster/<identifier>/<type>` in `cloudwatchlogs.ts` |
| `autoMinorVersionUpgrade` | Auto minor upgrade | `boolean` | `true` | |
| `multiAz` | Multi-AZ | `boolean` | — | RDS only |
| `storageEncrypted` | Encryption | `boolean` | — | |
| `tags` | Tags | map | — | |

## Secrets (`secrets.ts`, `awsSecretsConfig`, feature `dbs`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `initialValue` | Dummy value stored at creation | string | `CHANGE_ME` | Kept in the state. The real value is set with the AWS CLI (see [operations.md](../operations.md)); later changes are ignored by Terraform |
| `recoveryWindowInDays` | Days a deleted secret can be restored | `0`, `7`–`30` | `0` | With `7`–`30` the name cannot be reused until the period ends |
| `secrets[].key` | Key | string | **Required** | |
| `secrets[].name` | Secret name | string | `<PROJECT_NAME>-aws-secret-<key>` | |
| `secrets[].description` | Description | string | **Required** | |

## Containers (feature `containers`)

### Load balancers (`alb.ts`, `albConfigs[]`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build` | Create | `boolean` | **Required** | Keep the HTTPS and the plain-HTTP pattern as two entries and switch with `build` |
| `name`, `key` | ALB name; Terraform address key | string | **Required**; key = `name` | |
| `internal` | Internal ALB | `boolean` | **Required** | |
| `securityGroupNames`, `subnetNames` | Security groups and subnets | names | **Required** | |
| `dnsConfig.subdomain`, `dnsConfig.fqdn` | Public zone and record name | strings | — | Built from `PUBLIC_DOMAIN`. An A alias record is created when `features.dns` is on and the zone exists |
| `certificateConfig.enabled` | Use a certificate | `boolean` | — | |
| `certificateConfig.mode` | How the certificate is obtained | `"AWS_MANAGED"` (ACM, DNS validation), `"IMPORT"` (files) | — | |
| `certificateConfig.domains` | Domains | strings | — | First = main name, others = SANs |
| `certificateConfig.validationZone` | Public zone for DNS validation | zone name | — | `AWS_MANAGED` only; needs `features.dns`. Without a certificate, an HTTPS listener makes synth print a warning and the deploy fails (AWS requires a certificate); use the plain-HTTP pattern (`build`) or `IMPORT` instead |
| `certificateConfig.certificatePath`, `privateKeyPath`, `certificateChainPath` | Files to import | paths | — | `IMPORT` only; missing files give a warning and no certificate |
| `listenerConfig` | Main listener | `{ name, port, protocol, sslPolicy?, defaultAction }` | **Required** | `protocol` `HTTP` or `HTTPS`. The certificate is attached automatically |
| `additionalListeners[]` | Other listeners (HTTP redirect, blue/green test listener) | same as `listenerConfig`, plus `key?` | — | |
| `defaultAction` | Action | `type`: `forward` (`targetGroupName`), `redirect` (`redirect`), `fixed-response` (`fixedResponse`) | **Required** | |
| `targetGroups[]` | Target groups | `{ name, key?, port, protocol, targetType, healthCheckPath }` | **Required** | `targetType`: `ip`, `instance` |
| `listenerRules[]` | Rules | `{ priority, conditions: { pathPatterns?, hostHeaders?, httpHeaders? }, action }` | `[]` | |
| `tags` | Tags | map | — | |

### ECS (`ecs.ts`, `awsEcsConfigs[]`, `awsEcsClusterSettings`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build` | Create | `boolean` | **Required** | |
| `name`, `key` | Service / task family name; Terraform address key | string | **Required**; key = `name` | |
| `clusterName` | Cluster (created by the first service that uses it) | string | **Required** | |
| `cpu`, `memory` | Task size | Fargate-valid strings (`"256"`, `"512"`) | **Required** | |
| `desiredCount` | Tasks | number | **Required** | |
| `deploymentStrategy` | Deployment | `"ROLLING"`, `"BLUE_GREEN"` | `ROLLING` | |
| `bakeTime` | Minutes before a blue/green deployment is stable | number | — | |
| `enableExec` | ECS Exec | `boolean` | `false` | |
| `autoScaling` | Target tracking | `{ enabled, minCapacity, maxCapacity, cpuThreshold?, memoryThreshold?, requestCountPerTarget?, scaleInCooldown?, scaleOutCooldown?, cpuPolicyName?, memoryPolicyName?, requestPolicyName? }` | — | `requestCountPerTarget` only with `ROLLING` and an ALB target group. Policy names default to `<PROJECT_NAME>-aws-ecs-<cpu\|mem\|req>-scaling-<service>` |
| `executionRoleName`, `taskRoleName`, `infraRoleName` | IAM roles | `name`s in `iam.ts` | **Required**; `infraRoleName` only for `BLUE_GREEN` | |
| `cloudwatchLogGroupName` | Log group | name in `cloudwatchlogs.ts` | **Required** | |
| `logMode`, `logMaxBufferSize` | awslogs delivery | `"blocking"`, `"non-blocking"`; e.g. `"25m"` | account setting; `10m` | |
| `containerName`, `image`, `port`, `environment[]` | Container | strings; `{ name, value }` | **Required** except `environment` | |
| `securityGroupNames`, `subnetNames` | Network | names | **Required** | |
| `targetGroupName`, `targetGroupNameGreen`, `listenerName`, `testListenerName` | Link to the ALB | names set in `alb.ts` | — | |
| `awsEcsClusterSettings.<cluster>.containerInsights` | Container Insights | `"enhanced"`, `"enabled"`, `"disabled"` | account setting | `enhanced` adds metric charges |
| `tags` | Tags | map | — | |

## CI/CD (`cicd/cicdsettings.ts`, `awsCicdConfigs[]`, feature `cicd`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build`, `name`, `key` | Create; ECR / project name; address key | | **Required**; key = `name` | |
| `ecr.imageRetentionInDays` | Expire images after N days | number | **Required** | |
| `ecr.scanOnPush` | Scan on push | `boolean` | **Required** | |
| `codebuild.computeType`, `image`, `type`, `privilegedMode` | Build environment | e.g. `BUILD_GENERAL1_SMALL`; image; `LINUX_CONTAINER`; `boolean` | **Required** | `privilegedMode` is needed for Docker builds |
| `codebuild.securityGroupNames`, `subnetNames` | VPC placement | names | **Required** | |
| `codebuild.repositoryUrl` | Source repository | URL | `appRepositoryUrl` (`config/cicd.ts`) | |
| `codebuild.codeConnectionName` | Name of the CodeConnections connection to GitHub (`AVAILABLE`) | name, `byEnv` | `multicloud-github` | Created and approved before the deploy ([getting-started.md](../getting-started.md)). The ARN is looked up by name at plan time (the plan fails if no such connection exists). When set: the source is read through it, a webhook starts the build on pushes to `cicdTrigger.branches`, and the service role gets `codeconnections:*` on it. Empty: warning, no webhook |
| `codebuild.environmentVariables` | Plain-text variables | `{ name, value }[]` | — | |
| `codebuild.serviceRoleName` | IAM role | name in `iam.ts` | **Required** | |
| `codebuild.cloudwatchLogGroupName` | Log group | name in `cloudwatchlogs.ts` | — | |
| `deployTarget.ecsServiceName` | ECS service the build deploys to | service `name` in `ecs.ts` (`build: true`) | — (build and push only) | Passes `ECS_CLUSTER`, `ECS_SERVICE`, `CONTAINER_NAME` to the build and adds `ecs:DescribeServices` / `UpdateService` on the service, `ecs:RegisterTaskDefinition` / `DescribeTaskDefinition`, and `iam:PassRole` on the service's execution and task roles to the service role. `REPOSITORY_URI` is always passed |
| `tags` | Tags | map | — | |

## IAM (`iam.ts`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `iamRolesConfig[]` | Roles created up-front and referenced by name | `{ name, key?, assumeRolePolicy, managedPolicyArns?, inlinePolicies?: [{ name, policy }], customPolicyNames? }` | — | `policy` is a plain object (JSON-stringified internally). Roles: RDS monitoring, ECS execution / task / infrastructure, CodeBuild |
| `iamPoliciesConfig[]` | Standalone policies shared by roles via `customPolicyNames` | `{ name, key?, policy, description? }` | `[]` | |

## CloudWatch Logs (`cloudwatchlogs.ts`, `cloudwatchLogGroupsConfig[]`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `name` | Log group name | string | **Required** | Must match the name used by the RDS / ECS / CodeBuild / VPN config that writes to it |
| `key` | Terraform address key | string | `name` | |
| `retentionInDays` | Retention | CloudWatch-valid days | `0` (never expire) | |
| `tags` | Tags | map | — | |

## Monitoring (`monitoring.ts`)

### Alerting (feature `alerting`, `awsAlertingConfig`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `notificationTargets[]` | SNS topics | `{ key, name?, emails[], tags? }` | `[]` | `name` default `<PROJECT_NAME>-aws-alerts-<key>`. Each recipient must confirm the subscription e-mail |
| `metricFilters[]` | Log metric filters | `{ name, key?, logGroupName, pattern, metricName, metricNamespace, value?, defaultValue? }` | `[]` | `logGroupName` must exist in `cloudwatchlogs.ts`. `value` default `"1"` |
| `alarms[]` | Metric alarms | `{ alarmName, key?, namespace, metricName, dimensions, statistic, comparisonOperator, threshold, period, evaluationPeriods, notify?, notifyOnOk? }` | `[]` | `notify`: keys of `notificationTargets`. `notifyOnOk` default `false` |

### Log archive (feature `logArchive`, `awsLogArchiveConfig`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `deleteOnDestroy` | Delete the bucket and logs on destroy | `boolean` | `true` | `false` keeps them, but destroy fails while the bucket is not empty |
| `mode` | Delivery method | `"firehose"` (continuous, per-GB charge), `"export"` (daily via Lambda) | `firehose` | A log group can have at most 2 subscription filters |
| `bucket.name` | S3 bucket | globally unique string | **Required** when `logArchive` is on | Use `byEnv` for per-environment names |
| `bucket.lifecycle` | Glacier / expiry | `{ transitionToGlacierDays?, expireDays? }` | `30`, `365` | |
| `logGroups` | Log groups to archive | names in `cloudwatchlogs.ts` | api-service, worker-service | |
| `firehose` | Buffering | `{ bufferingSizeMb, bufferingIntervalSeconds }` | `5`, `300` | `firehose` only |
| `export` | Schedule | `{ scheduleExpression, scheduleExpressionTimezone?, lambdaLogRetentionDays }` | `cron(0 2 * * ? *)`, `Asia/Tokyo`, `14` | `export` only. Exports the last full UTC day that ended 12+ hours ago |
| `names` | Names of roles, Lambda, schedule, streams, filters | see `monitoring.ts` | `<PROJECT_NAME>-aws-log-archive-<role>` | |
| `tags` | Tags | map | — | |

## Private DNS (`privatezone.ts`, `awsPrivateZoneParams`, when `hostZones` is on)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `enableConditionalForwarding` | Forward other clouds' private domains with Route 53 Resolver | `boolean` | `true` | |
| `resolverSecurityGroupName` | Security group of the resolver endpoints | name in `securityGroups` | `route53-resolver-sg` | Opens TCP / UDP 53 to the VPC and the other clouds |
| `forwardingDomains` | Domains forwarded to the other clouds | strings | Azure PostgreSQL / Private Link / Azure Files domains, `azure.inner`, `google.inner` | |
| `outboundEndpointName`, `inboundEndpointName` | Resolver endpoint names | string | | |
| `resolverRuleNames` | Rule name per forwarding domain | map | `<PROJECT_NAME>-aws-resolver-rule-<domain>` | |
| `rdsInternalZone` | Private zone for short names | `{ zoneName, comment, tags }` | `aws.inner` | |
| `rdsCnameRecords[]` | Short names of databases | `{ shortName, dbIdentifier, type: "rds" \| "aurora" }` | — | `dbIdentifier` must match `aurorards.ts` |
| `privateZoneComments`, `tags` | Comments and tags | | | |

## VPN (`vpn.ts`, `awsVpnparams`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `bgpAwsAsn` | AWS-side BGP ASN | number | `64512` | |
| `vpnGatewayName` | Virtual private gateway name | string | **Required** | |
| `customerGateways.<google\|azure>.customerGatewayNames` | Customer gateway names, one per peer gateway IP (`singleTunnel`: 1, `haBgp`: 2) | strings | `<PROJECT_NAME>-aws-cgw-<destination>-<n>` | |
| `...vpnConnectionNames` | VPN connection names | strings | `<PROJECT_NAME>-aws-vpn-connection-<destination>-<n>` | |
| `...logGroupName` | Log group of tunnel logs | name in `cloudwatchlogs.ts` | **Required** | |
| `...logs` | Tunnel activity logs | `boolean` | **Required** | |
| `...logOutputFormat` | Log format | `"text"`, `"json"` | AWS default | Changing it interrupts each tunnel for several minutes |
| `propagateRouteTableNames` | Route tables that receive VPN routes | route table `name`s | **Required** | |
| `vpnGatewayTags`, `customerGatewayTags` | Tags | map | — | |
