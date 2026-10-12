# Azure configuration

[日本語](azure.ja.md)

Directory: `config/azure/` (re-exported by `azuresettings.ts`). Feature switches are in [common.md](common.md#cloud-and-feature-switches-clouds). Conventions (`build`, `key`, references by name) are in [README.md](README.md).

## Common (`common.ts`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `RESOURCE_GROUP` | Resource group of all Azure resources | string | `rg_multicloud` | Created by cdktn |
| `LOCATION` | Region | Azure region display name | `Japan East` | |
| `VNET_NAME` | Virtual network name | string | `my-azure-vnet` | |
| `PUBLIC_DOMAIN` | Public DNS domain. Application Gateway host names (`api.<domain>`) and the public zone are built from it | domain string, `byEnv` | `azuretest.tohonokai.com` for all environments | Used only with `features.dns` |
| `azureCommonparams.tags` | Tags applied to common resources | map | `project: multicloud-vpn` | |

Names that must be unique in Azure use `envScopedName()`: Key Vault, ACR, database servers and storage accounts get the environment name appended in `stg` and `prod` (not in `dev`).

## Virtual network (`vnet/vnet.ts`, `vnet/subnets.ts`, `vnet/nsgRules.ts`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `vnetAddressSpace` | VNet address space | CIDR | `10.2.0.0/16` | Must not overlap AWS / Google Cloud |
| `vnetTags` | Tags | map | — | |
| `natenabled`, `natPublicIpName`, `natGatewayName` | NAT gateway | `boolean`; strings | `true` | Subnets join it with `natGatewayEnabled` |
| `bastionenabled` | Azure Bastion | `boolean` | `false` | Has an hourly cost |
| `bastionPublicIpName`, `bastionHostName`, `bastionIpConfigurationName`, `bastionSubnetcidr` | Bastion names and subnet | strings; CIDR | `10.2.110.0/24` | |
| `subnets`, `nsgConfigs` | See below | | | |

### Subnets (`subnets[]`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `name` | Subnet name, referenced from other files | string | **Required** | |
| `key` | Terraform address key | string | `name` | |
| `resourceName` | Real name | string | `<PROJECT_NAME>-azure-subnet-<name>` | |
| `cidr` | CIDR | CIDR inside the VNet | **Required** | |
| `natGatewayEnabled` | Attach the NAT gateway | `boolean` | `true` | Must be `false` for Private Endpoint subnets (breaks Azure DNS / IMDS routes) and for delegated subnets |
| `privateEndpointNetworkPoliciesEnabled` | Network policies for private endpoints | `boolean` | provider default | Set `false` for subnets holding private endpoints |
| `delegations[]` | Service delegations: `{ name, serviceName }` | e.g. `Microsoft.DBforPostgreSQL/flexibleServers`, `Microsoft.App/environments` | — | |

### Network security groups (`nsgConfigs[]`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `name` | NSG name | string | **Required** | |
| `subnetKeys` | Subnets the NSG is attached to | subnet `name`s | **Required** | |
| `tags` | Tags | map | — | |
| `rules[]` | Rules: `{ name, key?, priority, direction, access, protocol, sourcePortRange, destinationPortRange, sourceAddressPrefix, destinationAddressPrefix }` | `direction`: `Inbound`, `Outbound`; `access`: `Allow`, `Deny`; `priority`: 100–4096 | **Required** | Cross-cloud CIDRs, PostgreSQL and NFS are listed here |

## Virtual machines (`vm.ts`, `azureVmsConfigparams[]`, feature `vms`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build` | Create | `boolean` | **Required** | |
| `name`, `key` | VM name; address key | string | **Required**; key = `name` | |
| `nicName`, `nicIpConfigurationName` | NIC names | string | default name | |
| `resourceGroupName`, `location` | | | **Required** | |
| `size` | VM size | e.g. `Standard_B1s` | **Required** | |
| `adminUsername` | Admin user | string | **Required** | |
| `publicKeyPath` | SSH public key file | path | **Required** | |
| `osDisk` | `{ caching, storageAccountType, diskSizeGb? }` | `ReadWrite`, `ReadOnly`, `None`; `Standard_LRS`, `Premium_LRS`, ... | **Required** | |
| `sourceImageReference` | `{ publisher, offer, sku, version }` | | **Required** | |
| `subnetKey` | Subnet | subnet `name` | **Required** | |
| `tags` | Tags | map | — | |
| `vmInitScriptPath` | Initialization script | path | — | `./scripts/vm_init.sh` |

## Database (`azuredatabase/databases.ts`, `azureDatabaseConfig`, feature `dbs`) — PostgreSQL only

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `resourceGroupName`, `location` | | | **Required** | |
| `sharedDnsVnetLinkNames.postgresql` | VNet link name of the shared privatelink DNS zone | string | `postgresql-shared-vnet-link` | |
| `databases[].build` | Create | `boolean` | **Required** | |
| `type` | Engine | `"postgresql"` | **Required** | Only PostgreSQL is configured |
| `name`, `key` | Database name; address key | string | **Required**; key = `serverName` | |
| `serverName` | Server name | string via `envScopedName` | **Required** | Globally unique |
| `subnetKey` | Delegated subnet | subnet `name` | **Required** | One subnet per server |
| `serverAdminLogin`, `serverAdminPassword` | Admin | from `AZUREDB_ROOT_USER`, `AZUREDB_ROOT_PASSWORD` | | |
| `skuName` | SKU | e.g. `B_Standard_B1ms`, `GP_Standard_D2ds_v4` | **Required** | Capacity errors may occur in some regions |
| `storageMb`, `storageIops` | Storage | MB; IOPS | provider default | |
| `version` | PostgreSQL major version | e.g. `"18"` | **Required** | |
| `backupRetentionDays` | Backup retention | 7–35 | provider default | |
| `geoRedundantBackupEnabled` | Geo-redundant backup | `boolean` | `false` | |
| `zone`, `highAvailabilityMode`, `standbyAvailabilityZone` | Zone and HA | `"1"`…; `"ZoneRedundant"`, `"SameZone"`, undefined; zone | HA off | |
| `publicNetworkAccessEnabled` | Public access | `boolean` | provider default | `false`: VNet integration only |
| `maintenanceWindow` | `{ dayOfWeek, startHour, startMinute }` | 0–6; 0–23; 0–59 | Azure chooses | |
| `tlsEnforcementEnabled` | | `boolean` | provider default | |
| `tags` | Tags | map | — | |
| `cnameRecordName` | CNAME in the `azure.inner` private zone | name | — | |
| `configurationParametersFile` | Server parameters | path | — | `postgres-parameters.ts`; applied as `PostgresqlFlexibleServerConfiguration` |

## Key Vault (`secrets.ts`, `azureKeyVaultConfig`, feature `dbs`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `name` | Vault name | 3–24 characters, via `envScopedName` | **Required** | Globally unique |
| `resourceGroupName`, `location` | | | **Required** | |
| `skuName` | SKU | `standard`, `premium` | `standard` | |
| `softDeleteRetentionDays` | Restore period | 7–90 | `7` | |
| `purgeProtectionEnabled` | Block purge until retention ends | `boolean` | `false` | |
| `subnetName` | Subnet of the private endpoint | subnet `name` | `private-endpoint-subnet` | The vault is reachable only through the private endpoint |
| `secretsOfficerPrincipalIds` | Object IDs allowed to read / write secrets | list of GUIDs | `[]` | Role *Key Vault Secrets Officer*. The identity that runs cdktn is always added; it needs Owner or User Access Administrator to create the role assignment |
| `names` | Private endpoint, connection, DNS zone group, VNet link names | strings | `<PROJECT_NAME>-azure-<kind>-<vault name>` | |
| `secretNames` | Secret names used by the CLI procedure | strings | `db-api-password`, `db-repl-password` | cdktn does not create the secrets (see [operations.md](../operations.md)) |

## Files (`files.ts`, `azureFilesConfigs[]`, feature `storage`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build` | Create | `boolean` | **Required** | |
| `accountName` | Storage account | 3–24 lowercase letters and digits, via `envScopedName(..., { hyphen: false })` | **Required** | Globally unique |
| `key` | Address key | string | `accountName` | |
| `names` | `privateEndpoint`, `privateServiceConnection`, `privateDnsZoneGroup`, `privateDnsZoneVnetLink` | strings | default name | `privateDnsZoneVnetLink` is used by the account that creates the shared zone |
| `resourceGroupName`, `location` | | | **Required** | |
| `shareName`, `shareKey` | Share name; address key | string | **Required**; key = `shareName` | |
| `enabledProtocol` | Protocol | `"SMB"`, `"NFS"` | `SMB` | NFS: `tier: "Premium"`, `replicationType` `LRS` or `ZRS`, `privateEndpointEnabled: true`, `quotaInGb` ≥ 100 |
| `quotaInGb` | Quota | GiB | `5120` (SMB), `100` (NFS) | |
| `tier` | Account tier | `TransactionOptimized`, `Hot`, `Cool`, `Premium` | — | |
| `accessTier` | Access tier | `Hot`, `Cool` | `Hot` (SMB) | |
| `replicationType` | Replication | `LRS`, `GRS`, `RAGRS`, `ZRS` | `LRS` | |
| `privateEndpointEnabled` | Private endpoint | `boolean` | — | Forced on for NFS |
| `subnetKey` | Subnet for the private endpoint | subnet `name` | — | |
| `allowedIpRanges` | IPs allowed through the firewall (Portal, Storage Explorer) | IP / CIDR list | — | `[]` = private endpoint only |
| `cnameRecordName` | CNAME in `azure.inner` | name | — | |
| `tags` | Tags | map | — | |

## Containers (feature `containers`)

### Container Apps (`containerapps.ts`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `azureAcaEnvironmentDefaults.logs` | Send environment logs to Log Analytics | `boolean` | `true` | |
| `azureAcaEnvironmentDefaults.diagnosticSettingName` | Diagnostic setting name | string | `<PROJECT_NAME>-azure-aca-env-diagnostic-setting-<environment>` | |
| `azureAcaEnvironmentSettings.<environmentName>` | Per-environment override of the above | same | — | |
| `azureAcaConfigs[].build` | Create | `boolean` | **Required** | |
| `name`, `key` | App name; address key | string | **Required**; key = `name` | |
| `resourceGroupName`, `location` | | | **Required** | |
| `environmentName`, `environmentKey` | Container Apps environment (shared by apps with the same name); address key | string | **Required**; key = name | |
| `privateDnsVnetLinkName` | VNet link name of the private zone (internal environments) | string | | |
| `image` | Container image | string | **Required** | |
| `cpu`, `memory` | Resources | number; e.g. `"0.5Gi"` | **Required** | |
| `targetPort` | Port | number | **Required** | |
| `internal` | Internal environment (VNet only) | `boolean` | **Required** | |
| `externalEnabled` | External ingress | `boolean` | **Required** | |
| `subnetName` | Delegated subnet | subnet `name` | **Required** for internal | `""` for a public environment |
| `env[]` | Environment variables | `{ name, value }` | — | |
| `minReplicas`, `maxReplicas` | Scaling | number | `0`, `10` | |
| `scaleRules[]` | Scale rules | `{ type: "http", name, concurrentRequests }`, `{ type: "cpu" \| "memory", name, utilization }` | HTTP scale (10 concurrent requests per replica) | CPU / memory rules cannot scale to zero |
| `cnameRecordName` | CNAME in `azure.inner` | name | — | |
| `appGwBackendName` | Backend of an Application Gateway that points to this app | backend `name` | — | |

### Application Gateway (`applicationgateway.ts`, `azureAppGwConfigs[]`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build` | Create | `boolean` | **Required** | The HTTPS, WAF and plain-HTTP patterns are separate entries; switch with `build` |
| `name`, `key` | Gateway name; address key | string | **Required**; key = `name` | |
| `names` | `publicIp`, `wafPolicy`, `gatewayIpConfiguration`, `frontendIpConfiguration`, `frontendPorts` (per port) | strings | `<PROJECT_NAME>-azure-appgw-<kind>-<gateway>` | |
| `location`, `resourceGroupName` | | | **Required** | |
| `subnetName` | Gateway subnet | subnet `name` | **Required** | `web-appgw-subnet` |
| `useAutoscale` | Autoscale | `boolean` | **Required** | `false`: fixed `sku.capacity`; `true`: `minCapacity`–`maxCapacity` and `capacity` is ignored |
| `sku` | `{ name, tier, capacity?, minCapacity?, maxCapacity? }` | `Standard_v2`, `WAF_v2` | **Required** | Autoscale defaults `1`, `3` |
| `enableHttp2`, `enableFips` | | `boolean` | — | |
| `dnsConfig` | `{ subdomain, fqdn? }` | strings | — | Built from `PUBLIC_DOMAIN` |
| `listeners[]` | Listeners | `{ name, names?, port, protocol: "Http" \| "Https", defaultBackendName?, sslCertificateName?, redirectToListener? }` | **Required** | `redirectToListener` redirects to another listener (HTTP → HTTPS). `Https` needs `sslCertificateName` |
| `backends[]` | Backend pools and settings | `{ name, names?, port, protocol, requestTimeout, hostName?, targetFqdns?, pickHostNameFromBackendAddress? }` | **Required** | `pickHostNameFromBackendAddress` default `false`; `hostName` default: the public IP |
| `pathRules[]` | Path-based routing | `{ name, paths, backendName }` | — | |
| `wafConfig` | `{ enabled, firewallMode, ruleSetType?, ruleSetVersion? }` | `Detection`, `Prevention` | `OWASP`, `3.2` | `WAF_v2` only |
| `wafCustomRules[]` | Custom WAF rules | `{ name, priority, ruleType: "MatchRule", action: "Allow" \| "Block" \| "Log", matchConditions }` | — | |
| `sslCertificates[]` | PFX certificates | `{ name, data: path, password }` | — | `password` from `AZURE_APPGW_SSL_CERT_PASSWORD` |
| `tags` | Tags | map | — | |

## CI/CD (`devops_acr_config.ts`, `azureDevOpsAcrConfigs[]`, feature `cicd`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `build` | Create | `boolean` | **Required** | |
| `name`, `key` | Registry name; address key | 5–50 lowercase letters / digits, via `envScopedName(..., { hyphen: false })` | **Required**; key = `name` | Globally unique |
| `names` | Private endpoint, connection, DNS zone group, VNet link | strings | default name | |
| `resourceGroupName`, `location` | | | **Required** | |
| `sku` | SKU | `Basic`, `Standard`, `Premium` | **Required** | Private endpoints need `Premium` |
| `subnetName` | Subnet of the private endpoint | subnet `name` | **Required** | |
| `adminEnabled` | Admin user | `boolean` | — | |

## CI/CD: Azure Pipelines (`cicd.ts`, `azureDevOpsConfig`, feature `cicd`)

The pipeline runs `azure-pipelines.yml` of the application repository (`config/cicd.ts`) on a Managed DevOps Pool (build agents created by Microsoft on demand, joined to the VNet), pushes the image to the ACR and updates the Container App. The manual steps (organization, project, GitHub connection, service principal membership, resource providers, DevOpsInfrastructure object ID) are in [getting-started.md](../getting-started.md). Requires `cdktn get` (Azure DevOps provider in `.gen/`).

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `organization`, `project` | Azure DevOps organization and project | names, `byEnv` | `otazoman-multicloud`, `multicloud-api` | Must exist; cdktn signs in with `ARM_CLIENT_ID` / `ARM_CLIENT_SECRET` / `ARM_TENANT_ID`, which must be an organization member |
| `githubServiceConnectionName` | GitHub service connection (GitHub App) of the project | name, `byEnv` | `github.com_Otazoman` | Looked up by name |
| `devOpsInfrastructurePrincipalId` | Object ID of the DevOpsInfrastructure service principal | from `AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID` | — (warning) | cdktn grants it Reader and Network Contributor on the VNet before creating the pool |
| `pool.name` | Pool (Azure resource and Azure DevOps agent pool) | string | `multicloud-devops-pool` | Default pool of the pipeline |
| `pool.devCenterName`, `pool.devCenterProjectName` | Dev Center and project the pool belongs to | strings | `multicloud-devcenter`, `multicloud-devcenter-project` | No charge |
| `pool.subnetName` | Subnet of the agents | subnet `name` | `devops-pool-subnet` (`10.2.60.0/24`) | Delegated to `Microsoft.DevOpsInfrastructure/pools`, NAT gateway attached |
| `pool.vmSize`, `pool.image` | Agent VM size and well-known image | strings | `Standard_D2ads_v5`, `ubuntu-24.04` | The image includes Docker and the Azure CLI |
| `pool.maximumConcurrency` | Agents at the same time (and parallelism) | number | `1` | One self-hosted parallel job is free |
| `pool.standbyAgents` | Agents kept ready while idle | number | `0` | `0`: VMs exist (and are billed) only while a job runs |
| `pool.identityName` | User-assigned identity of the agents | string | `multicloud-devops-pool-identity` | Gets AcrPush on the ACR and Contributor on the target Container App; passed as `AZURE_CLIENT_ID` |
| `pipeline.build` | Create the pipeline (and the pool) | `boolean` | `true` | |
| `pipeline.name`, `pipeline.ymlPath` | Pipeline name; build definition in the repository | strings | `multicloud-api-deploy`, `azure-pipelines.yml` | Starts on pushes to `cicdTrigger.branches` (`config/cicd.ts`) |
| `pipeline.deployTarget.containerAppName` | Container App the pipeline deploys to | `name` in `containerapps.ts` (`build: true`) | `backend-api-service` | Terraform ignores its image; it pulls from the ACR with its own identity |
| `pipeline.deployTarget.acrName` | Registry | `name` in `devops_acr_config.ts` | `mycompanyacr001` (via `envScopedName`) | |
| `pipeline.deployTarget.pullIdentityName` | Identity the Container App pulls with | string | `backend-api-service-acr-pull` | AcrPull only |

Pipeline variables set by cdktn: `AZURE_CLIENT_ID`, `ACR_NAME`, `ACR_LOGIN_SERVER`, `RESOURCE_GROUP`, `CONTAINER_APP_NAME`.

## Monitoring (`azuremonitor.ts`)

### Log Analytics and action groups (`azureMonitorConfig`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `isEnabled` | Create the monitoring resources | `boolean` | `true` | |
| `resourceGroupName`, `location` | | | **Required** | |
| `logAnalyticsWorkspace` | `{ name, sku, retentionInDays }` | `sku`: `PerGB2018` | **Required** | |
| `tableRetention` | Retention per table | map of table → days | workspace retention | `AzureDiagnostics` (VPN gateway), `ContainerAppConsoleLogs`, `ContainerAppSystemLogs` |
| `applicationInsightsName` | Application Insights | string | **Required** | |
| `actionGroups[]` | Notification targets | `{ key, name, shortName, emailReceivers: [{ name, emailAddress, useCommonAlertSchema }] }` | — | Created only with `features.alerting`. Referenced by `key` |
| `tags` | Tags | map | — | |

### Alerting (`azureAlertingConfig`, feature `alerting`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `logAlerts[]` | Log search alerts | `AzureLogAlertDefinition` without `scopes` / `actionGroups`, plus `scopes?`, `notify?: string[]` | `[]` | `notify`: `actionGroups` keys. `key?` fixes the address |
| `metricAlerts[]` | Metric alerts | `AzureMetricAlertDefinition` without `scopes` / `actionGroups`, plus `target?: { type: "containerApp", name }`, `scopes?`, `notify?` | `[]` | See `constructs/observability/azuremonitor.ts` for the fields |

### Log archive (`azureLogArchiveConfig`, feature `logArchive`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `deleteOnDestroy` | Delete the account and logs on destroy | `boolean` | `true` | |
| `storageAccount.name` | Storage account | 3–24 lowercase letters / digits | **Required** when `logArchive` is on | Globally unique. Use `byEnv` / `envScopedName` |
| `storageAccount.replication` | Replication | `LRS`, `GRS`, `RAGRS` | `LRS` | The archive tier does not support `ZRS` |
| `storageAccount.infrastructureEncryption` | Double encryption | `boolean` | `false` | Can only be set at creation; changing it replaces the account and deletes the logs |
| `storageAccount.lifecycle` | `{ toCoolDays?, toArchiveDays?, deleteDays? }` | days | `30`, `90`, `365` | |
| `acaEnvironments` | Environments to archive | `environmentName`s | every environment with `logs: true` | |

## Private DNS (`privatezone.ts`, `azurePrivateZoneParams`, when `hostZones` is on)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `resourceGroup`, `location` | | | | |
| `dnsResolverInboundSubnetCidr`, `dnsResolverInboundSubnetName`, `dnsResolverOutboundSubnetCidr`, `dnsResolverOutboundSubnetName` | Resolver subnets | CIDR (`/28` or larger); name | `10.2.120.0/28`, `10.2.121.0/28` | NSG `azure-dns-resolver-nsg` is attached |
| `dnsPrivateResolverName`, `inboundEndpointName`, `outboundEndpointName` | Resolver names | strings | | |
| `forwardingRulesetName`, `forwardingRulesetVnetLinkName` | Ruleset names | strings | | |
| `forwardingRules[]` | Domains forwarded to other clouds | `{ name, domainName (trailing dot), enabled, target: "aws" \| "google" }` | `aws.inner.`, `google.inner.`, `efs.<region>.amazonaws.com.` | The EFS rule is needed to resolve EFS mount targets from Azure |
| `azureInnerDomain` | Private zone `azure.inner` | `{ zoneName, vnetLinkName, enabled, cnameRecords[] }` | `azure.inner` | CNAMEs of databases, files and apps are generated from their `cnameRecordName` |
| `tags` | Tags | map | | |

## VPN (`vpn.ts`, `azureVpnparams`)

| Item | Description | Allowed values | Default | Notes |
|---|---|---|---|---|
| `gatewaySubnetCidr` | `GatewaySubnet` | CIDR (`/27` or larger) | `10.2.100.0/24` | |
| `vpnGatewayName` | VPN gateway | string | **Required** | |
| `publicIpNames`, `ipConfigurationNames` | Public IPs and IP configurations, one per gateway instance | two strings | **Required** | |
| `publicIpZones` | Zones of the public IPs | `["1","2","3"]` or `[]` | `["1","2","3"]` | Required for AZ SKUs |
| `pipAlloc` | Allocation | `Dynamic`, `Static` | `Dynamic` | |
| `sku` | Gateway SKU | `VpnGw1AZ`, ... | `VpnGw1AZ` | |
| `type`, `vpnType`, `vpnConnectionType` | | `Vpn`; `RouteBased`; `IPsec` | | |
| `azureAsn` | Azure-side BGP ASN | number | `65515` | |
| `logs`, `diagnosticSettingName`, `retentionInDays` | Gateway logs to Log Analytics | `boolean`; string; days | `true` | Retention of the `AzureDiagnostics` table is `tableRetention` |
| `localNetworkGateways.<aws\|google>` | `gatewayNames`, `connectionNames` in tunnel order | strings | `<PROJECT_NAME>-azure-lng-<peer>-<n>` / `-vpn-connection-<peer>-<n>` | AWS has four, Google two |
| `vpnGwtags`, `localGwtags` | Tags | map | | |
