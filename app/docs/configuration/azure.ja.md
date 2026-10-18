# Azure の設定

[English](azure.md)

ディレクトリ: `config/azure/`（`azuresettings.ts` がまとめて export）。機能の ON/OFF は [common.ja.md](common.ja.md#クラウドと機能の切り替えclouds) にあります。共通の決まり（`build`、`key`、名前での参照）は [README.ja.md](README.ja.md) にあります。

## 共通（`common.ts`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `RESOURCE_GROUP` | すべての Azure リソースのリソースグループ | 文字列 | `rg_multicloud` | cdktn が作る |
| `LOCATION` | リージョン | Azure のリージョンの表示名 | `Japan East` | |
| `VNET_NAME` | 仮想ネットワークの名前 | 文字列 | `my-azure-vnet` | |
| `PUBLIC_DOMAIN` | 公開 DNS のドメイン。Application Gateway のホスト名（`api.<ドメイン>`）と公開ゾーンはここから作られる | ドメインの文字列、`byEnv` | すべての環境で `azuretest.tohonokai.com` | `features.dns` を使うときだけ使われる |
| `azureCommonparams.tags` | 共通のリソースに付けるタグ | マップ | `project: multicloud-vpn` | |

Azure 全体で一意である必要がある名前は `envScopedName()` を使います。Key Vault、ACR、DB のサーバー、ストレージアカウントは、`stg` と `prod` で環境名が付きます（`dev` では付きません）。

## 仮想ネットワーク（`vnet/vnet.ts`、`vnet/subnets.ts`、`vnet/nsgRules.ts`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `vnetAddressSpace` | VNet のアドレス空間 | CIDR | `10.2.0.0/16` | AWS / Google Cloud と重ならないこと |
| `vnetTags` | タグ | マップ | — | |
| `natenabled`、`natPublicIpName`、`natGatewayName` | NAT ゲートウェイ | `boolean`、文字列 | `true` | サブネットは `natGatewayEnabled` で参加する |
| `bastionenabled` | Azure Bastion | `boolean` | `false` | 時間単位の料金がかかる |
| `bastionPublicIpName`、`bastionHostName`、`bastionIpConfigurationName`、`bastionSubnetcidr` | Bastion の名前とサブネット | 文字列、CIDR | `10.2.110.0/24` | |
| `subnets`、`nsgConfigs` | 下記を参照 | | | |

### サブネット（`subnets[]`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `name` | サブネットの名前。ほかのファイルから参照される | 文字列 | **必須** | |
| `key` | Terraform のアドレスのキー | 文字列 | `name` | |
| `resourceName` | 実際の名前 | 文字列 | `<PROJECT_NAME>-azure-subnet-<name>` | |
| `cidr` | CIDR | VNet の中の CIDR | **必須** | |
| `natGatewayEnabled` | NAT ゲートウェイを付ける | `boolean` | `true` | プライベートエンドポイントのサブネット（Azure の DNS / IMDS へのルートが壊れる）と、委任したサブネットでは `false` にすること |
| `privateEndpointNetworkPoliciesEnabled` | プライベートエンドポイントのネットワークポリシー | `boolean` | provider の既定 | プライベートエンドポイントを置くサブネットでは `false` |
| `delegations[]` | サービスへの委任: `{ name, serviceName }` | 例: `Microsoft.DBforPostgreSQL/flexibleServers`、`Microsoft.App/environments` | — | |

### ネットワーク セキュリティ グループ（`nsgConfigs[]`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `name` | NSG の名前 | 文字列 | **必須** | |
| `subnetKeys` | NSG を付けるサブネット | サブネットの `name` | **必須** | |
| `tags` | タグ | マップ | — | |
| `rules[]` | ルール: `{ name, key?, priority, direction, access, protocol, sourcePortRange, destinationPortRange, sourceAddressPrefix, destinationAddressPrefix }` | `direction`: `Inbound`、`Outbound`。`access`: `Allow`、`Deny`。`priority`: 100〜4096 | **必須** | クラウド間の CIDR、PostgreSQL、NFS をここに書く |

## 仮想マシン（`vm.ts`、`azureVmsConfigparams[]`、機能 `vms`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build` | 作る | `boolean` | **必須** | |
| `name`、`key` | VM の名前、アドレスのキー | 文字列 | **必須**、key = `name` | |
| `nicName`、`nicIpConfigurationName` | NIC の名前 | 文字列 | 既定の名前 | |
| `resourceGroupName`、`location` | | | **必須** | |
| `size` | VM のサイズ | 例: `Standard_B1s` | **必須** | |
| `adminUsername` | 管理者ユーザー | 文字列 | **必須** | |
| `publicKeyPath` | SSH 公開鍵のファイル | パス | **必須** | |
| `osDisk` | `{ caching, storageAccountType, diskSizeGb? }` | `ReadWrite`、`ReadOnly`、`None`。`Standard_LRS`、`Premium_LRS` など | **必須** | |
| `sourceImageReference` | `{ publisher, offer, sku, version }` | | **必須** | |
| `subnetKey` | サブネット | サブネットの `name` | **必須** | |
| `tags` | タグ | マップ | — | |
| `vmInitScriptPath` | 初期化スクリプト | パス | — | `./scripts/vm_init.sh` |

## データベース（`azuredatabase/databases.ts`、`azureDatabaseConfig`、機能 `dbs`）— PostgreSQL のみ

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `resourceGroupName`、`location` | | | **必須** | |
| `sharedDnsVnetLinkNames.postgresql` | 共有の privatelink DNS ゾーンの VNet リンクの名前 | 文字列 | `postgresql-shared-vnet-link` | |
| `databases[].build` | 作る | `boolean` | **必須** | |
| `type` | エンジン | `"postgresql"` | **必須** | 設定しているのは PostgreSQL のみ |
| `name`、`key` | DB の名前、アドレスのキー | 文字列 | **必須**、key = `serverName` | |
| `serverName` | サーバーの名前 | `envScopedName` で作る文字列 | **必須** | 全世界で一意 |
| `subnetKey` | 委任したサブネット | サブネットの `name` | **必須** | サーバーごとに 1 つのサブネット |
| `serverAdminLogin`、`serverAdminPassword` | 管理者 | `AZUREDB_ROOT_USER`、`AZUREDB_ROOT_PASSWORD` から | | |
| `skuName` | SKU | 例: `B_Standard_B1ms`、`GP_Standard_D2ds_v4` | **必須** | リージョンによっては容量不足のエラーになる |
| `storageMb`、`storageIops` | ストレージ | MB、IOPS | provider の既定 | |
| `version` | PostgreSQL のメジャーバージョン | 例: `"18"` | **必須** | |
| `backupRetentionDays` | バックアップの保存期間 | 7〜35 | provider の既定 | |
| `geoRedundantBackupEnabled` | geo 冗長バックアップ | `boolean` | `false` | |
| `zone`、`highAvailabilityMode`、`standbyAvailabilityZone` | ゾーンと高可用性 | `"1"` など。`"ZoneRedundant"`、`"SameZone"`、未指定。ゾーン | 高可用性なし | |
| `publicNetworkAccessEnabled` | パブリックアクセス | `boolean` | provider の既定 | `false`: VNet 統合のみ |
| `maintenanceWindow` | `{ dayOfWeek, startHour, startMinute }` | 0〜6、0〜23、0〜59 | Azure が決める | |
| `tlsEnforcementEnabled` | | `boolean` | provider の既定 | |
| `tags` | タグ | マップ | — | |
| `cnameRecordName` | プライベートゾーン `azure.inner` の CNAME | 名前 | — | |
| `configurationParametersFile` | サーバーのパラメータ | パス | — | `postgres-parameters.ts`。`PostgresqlFlexibleServerConfiguration` として適用する |

## Key Vault（`secrets.ts`、`azureKeyVaultConfig`、機能 `dbs`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `name` | Key Vault の名前 | 3〜24 文字、`envScopedName` で作る | **必須** | 全世界で一意 |
| `resourceGroupName`、`location` | | | **必須** | |
| `skuName` | SKU | `standard`、`premium` | `standard` | |
| `softDeleteRetentionDays` | 復元できる期間 | 7〜90 | `7` | |
| `purgeProtectionEnabled` | 保存期間が終わるまで完全削除を禁止する | `boolean` | `false` | |
| `subnetName` | プライベートエンドポイントのサブネット | サブネットの `name` | `private-endpoint-subnet` | Key Vault にはプライベートエンドポイントからしか接続できない |
| `secretsOfficerPrincipalIds` | シークレットを読み書きできるオブジェクト ID | GUID の一覧。`.env.<環境名>` の `AZURE_KEYVAULT_SECRETS_OFFICER_IDS`（カンマ区切り）から | `[]` | ロール *Key Vault Secrets Officer*。cdktn を実行する ID は常に加わる。ロールを割り当てるために、その ID には所有者またはユーザー アクセス管理者が必要 |
| `names` | プライベートエンドポイント、接続、DNS ゾーングループ、VNet リンクの名前 | 文字列 | `<PROJECT_NAME>-azure-<種類>-<Key Vault の名前>` | |
| `secretNames` | CLI の手順で使うシークレットの名前 | 文字列 | `db-api-password`、`db-repl-password` | cdktn はシークレットを作らない（[operations.ja.md](../operations.ja.md) を参照） |

## Files（`files.ts`、`azureFilesConfigs[]`、機能 `storage`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build` | 作る | `boolean` | **必須** | |
| `accountName` | ストレージアカウント | 小文字の英字と数字で 3〜24 文字、`envScopedName(..., { hyphen: false })` で作る | **必須** | 全世界で一意 |
| `key` | アドレスのキー | 文字列 | `accountName` | |
| `names` | `privateEndpoint`、`privateServiceConnection`、`privateDnsZoneGroup`、`privateDnsZoneVnetLink` | 文字列 | 既定の名前 | `privateDnsZoneVnetLink` は、共有のゾーンを作るアカウントが使う |
| `resourceGroupName`、`location` | | | **必須** | |
| `shareName`、`shareKey` | 共有の名前、アドレスのキー | 文字列 | **必須**、key = `shareName` | |
| `enabledProtocol` | プロトコル | `"SMB"`、`"NFS"` | `SMB` | NFS: `tier: "Premium"`、`replicationType` は `LRS` か `ZRS`、`privateEndpointEnabled: true`、`quotaInGb` は 100 以上 |
| `quotaInGb` | クォータ | GiB | `5120`（SMB）、`100`（NFS） | |
| `tier` | アカウントの階層 | `TransactionOptimized`、`Hot`、`Cool`、`Premium` | — | |
| `accessTier` | アクセス層 | `Hot`、`Cool` | `Hot`（SMB） | |
| `replicationType` | レプリケーション | `LRS`、`GRS`、`RAGRS`、`ZRS` | `LRS` | |
| `privateEndpointEnabled` | プライベートエンドポイント | `boolean` | — | NFS では常に有効 |
| `subnetKey` | プライベートエンドポイントのサブネット | サブネットの `name` | — | |
| `allowedIpRanges` | ファイアウォールを通す IP（ポータル、Storage Explorer） | IP / CIDR の一覧 | — | `[]` はプライベートエンドポイントのみ |
| `cnameRecordName` | `azure.inner` の CNAME | 名前 | — | |
| `tags` | タグ | マップ | — | |

## コンテナ（機能 `containers`）

### Container Apps（`containerapps.ts`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `azureAcaEnvironmentDefaults.logs` | 環境のログを Log Analytics に送る | `boolean` | `true` | |
| `azureAcaEnvironmentDefaults.diagnosticSettingName` | 診断設定の名前 | 文字列 | `<PROJECT_NAME>-azure-aca-env-diagnostic-setting-<環境>` | |
| `azureAcaEnvironmentSettings.<environmentName>` | 上記の、Container Apps の環境ごとの上書き | 同上 | — | |
| `azureAcaConfigs[].build` | 作る | `boolean` | **必須** | |
| `name`、`key` | アプリの名前、アドレスのキー | 文字列 | **必須**、key = `name` | |
| `resourceGroupName`、`location` | | | **必須** | |
| `environmentName`、`environmentKey` | Container Apps の環境（同じ名前のアプリで共有）、アドレスのキー | 文字列 | **必須**、key = 名前 | |
| `privateDnsVnetLinkName` | プライベートゾーンの VNet リンクの名前（内部の環境） | 文字列 | | |
| `image` | コンテナイメージ | 文字列 | **必須** | |
| `cpu`、`memory` | リソース | 数値、例: `"0.5Gi"` | **必須** | |
| `targetPort` | ポート | 数値 | **必須** | |
| `internal` | 内部の環境（VNet のみ） | `boolean` | **必須** | |
| `externalEnabled` | 外部からの上り（ingress） | `boolean` | **必須** | |
| `subnetName` | 委任したサブネット | サブネットの `name` | 内部の環境では**必須** | 公開の環境では `""` |
| `env[]` | 環境変数 | `{ name, value }` | — | |
| `minReplicas`、`maxReplicas` | スケーリング | 数値 | `0`、`10` | |
| `scaleRules[]` | スケールのルール | `{ type: "http", name, concurrentRequests }`、`{ type: "cpu" \| "memory", name, utilization }` | HTTP でスケール（レプリカあたり同時リクエスト 10） | CPU / メモリのルールでは 0 までスケールインできない |
| `cnameRecordName` | `azure.inner` の CNAME | 名前 | — | |
| `appGwBackendName` | このアプリを指す Application Gateway のバックエンド | バックエンドの `name` | — | |

### Application Gateway（`applicationgateway.ts`、`azureAppGwConfigs[]`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build` | 作る | `boolean` | **必須** | HTTPS、WAF、HTTP だけのパターンは別の項目。`build` で切り替える |
| `name`、`key` | ゲートウェイの名前、アドレスのキー | 文字列 | **必須**、key = `name` | |
| `names` | `publicIp`、`wafPolicy`、`gatewayIpConfiguration`、`frontendIpConfiguration`、`frontendPorts`（ポートごと） | 文字列 | `<PROJECT_NAME>-azure-appgw-<種類>-<ゲートウェイ>` | |
| `location`、`resourceGroupName` | | | **必須** | |
| `subnetName` | ゲートウェイのサブネット | サブネットの `name` | **必須** | `web-appgw-subnet` |
| `useAutoscale` | オートスケール | `boolean` | **必須** | `false`: `sku.capacity` で固定。`true`: `minCapacity`〜`maxCapacity` で、`capacity` は無視される |
| `sku` | `{ name, tier, capacity?, minCapacity?, maxCapacity? }` | `Standard_v2`、`WAF_v2` | **必須** | オートスケールの既定は `1`、`3` |
| `enableHttp2`、`enableFips` | | `boolean` | — | |
| `dnsConfig` | `{ subdomain, fqdn? }` | 文字列 | — | `PUBLIC_DOMAIN` から作る |
| `listeners[]` | リスナー | `{ name, names?, port, protocol: "Http" \| "Https", defaultBackendName?, sslCertificateName?, redirectToListener? }` | **必須** | `redirectToListener` は別のリスナーにリダイレクトする（HTTP → HTTPS）。`Https` には `sslCertificateName` が必要 |
| `backends[]` | バックエンドプールと設定 | `{ name, names?, port, protocol, requestTimeout, hostName?, targetFqdns?, pickHostNameFromBackendAddress? }` | **必須** | `pickHostNameFromBackendAddress` の既定は `false`。`hostName` の既定はパブリック IP |
| `pathRules[]` | パスでのルーティング | `{ name, paths, backendName }` | — | |
| `wafConfig` | `{ enabled, firewallMode, ruleSetType?, ruleSetVersion? }` | `Detection`、`Prevention` | `OWASP`、`3.2` | `WAF_v2` のみ |
| `wafCustomRules[]` | WAF のカスタムルール | `{ name, priority, ruleType: "MatchRule", action: "Allow" \| "Block" \| "Log", matchConditions }` | — | |
| `sslCertificates[]` | PFX の証明書 | `{ name, data: パス, password }` | — | `password` は `AZURE_APPGW_SSL_CERT_PASSWORD` から |
| `tags` | タグ | マップ | — | |

## CI/CD（`devops_acr_config.ts`、`azureDevOpsAcrConfigs[]`、機能 `cicd`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build` | 作る | `boolean` | **必須** | |
| `name`、`key` | レジストリの名前、アドレスのキー | 小文字の英字と数字で 5〜50 文字、`envScopedName(..., { hyphen: false })` で作る | **必須**、key = `name` | 全世界で一意 |
| `names` | プライベートエンドポイント、接続、DNS ゾーングループ、VNet リンク | 文字列 | 既定の名前 | |
| `resourceGroupName`、`location` | | | **必須** | |
| `sku` | SKU | `Basic`、`Standard`、`Premium` | **必須** | プライベートエンドポイントには `Premium` が必要 |
| `subnetName` | プライベートエンドポイントのサブネット | サブネットの `name` | **必須** | |
| `adminEnabled` | 管理者ユーザー | `boolean` | — | |

## CI/CD: Azure Pipelines（`cicd.ts`、`azureDevOpsConfig`、機能 `cicd`）

パイプラインは、アプリのリポジトリ（`config/cicd.ts`）の `azure-pipelines.yml` を、Managed DevOps Pool（Microsoft が必要なときに作り、VNet に接続するビルドのエージェント）で実行し、イメージを ACR に push して Container Apps を更新します。手作業（組織、プロジェクト、GitHub の接続、サービスプリンシパルのメンバー登録、リソースプロバイダー、DevOpsInfrastructure のオブジェクト ID）は [getting-started.ja.md](../getting-started.ja.md) にあります。`cdktn get`（`.gen/` の Azure DevOps の provider）が必要です。

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `organization`、`project` | Azure DevOps の組織とプロジェクト | 名前、`byEnv` | `otazoman-multicloud`、`multicloud-api` | 作成済みであること。cdktn は `ARM_CLIENT_ID` / `ARM_CLIENT_SECRET` / `ARM_TENANT_ID` でサインインし、そのサービスプリンシパルは組織のメンバーであること |
| `githubServiceConnectionName` | プロジェクトの GitHub のサービス接続（GitHub App） | 名前、`byEnv` | `github.com_Otazoman` | 名前から検索する |
| `devOpsInfrastructurePrincipalId` | サービスプリンシパル DevOpsInfrastructure のオブジェクト ID | `AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID` から | —（警告） | cdktn がプールの前に、VNet に対する閲覧者とネットワーク共同作成者を割り当てる |
| `pool.name` | プール（Azure のリソースと Azure DevOps のエージェントプール） | 文字列 | `multicloud-devops-pool` | パイプラインの既定のプール |
| `pool.devCenterName`、`pool.devCenterProjectName` | プールが所属する Dev Center とプロジェクト | 文字列 | `multicloud-devcenter`、`multicloud-devcenter-project` | 料金はかからない |
| `pool.subnetName` | エージェントのサブネット | サブネットの `name` | `devops-pool-subnet`（`10.2.60.0/24`） | `Microsoft.DevOpsInfrastructure/pools` に委任、NAT ゲートウェイあり |
| `pool.vmSize`、`pool.image` | エージェントの VM のサイズと、既定のイメージ | 文字列 | `Standard_D2ads_v5`、`ubuntu-24.04` | イメージには Docker と Azure CLI が入っている |
| `pool.maximumConcurrency` | 同時に動くエージェントの数（と並列数） | 数値 | `1` | 自前のエージェントの並列ジョブは 1 つまで無料 |
| `pool.standbyAgents` | 待機させておくエージェントの数 | 数値 | `0` | `0`: ジョブの実行中だけ VM があり、課金される |
| `pool.identityName` | エージェントのユーザー割り当てマネージド ID | 文字列 | `multicloud-devops-pool-identity` | ACR への AcrPush と、デプロイ先の Container Apps への共同作成者が付く。`AZURE_CLIENT_ID` として渡す |
| `pipeline.build` | パイプライン（とプール）を作る | `boolean` | `true` | |
| `pipeline.name`、`pipeline.ymlPath` | パイプラインの名前、リポジトリ内のビルドの定義 | 文字列 | `multicloud-api-deploy`、`azure-pipelines.yml` | `cicdTrigger.branches`（`config/cicd.ts`）への push で起動する |
| `pipeline.deployTarget.containerAppName` | パイプラインがデプロイする Container Apps | `containerapps.ts` の `name`（`build: true`） | `backend-api-service` | そのイメージは Terraform が無視する。ACR からは専用の ID で取得する |
| `pipeline.deployTarget.acrName` | レジストリ | `devops_acr_config.ts` の `name` | `mycompanyacr001`（`envScopedName` で作る） | |
| `pipeline.deployTarget.pullIdentityName` | Container Apps がイメージを取得する ID | 文字列 | `backend-api-service-acr-pull` | AcrPull のみ |

cdktn が設定するパイプラインの変数: `AZURE_CLIENT_ID`、`ACR_NAME`、`ACR_LOGIN_SERVER`、`RESOURCE_GROUP`、`CONTAINER_APP_NAME`。

## 監視（`azuremonitor.ts`）

### Log Analytics とアクショングループ（`azureMonitorConfig`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `isEnabled` | 監視のリソースを作る | `boolean` | `true` | |
| `resourceGroupName`、`location` | | | **必須** | |
| `logAnalyticsWorkspace` | `{ name, sku, retentionInDays }` | `sku`: `PerGB2018` | **必須** | |
| `tableRetention` | テーブルごとの保存期間 | テーブル → 日数のマップ | ワークスペースの保存期間 | `AzureDiagnostics`（VPN ゲートウェイ）、`ContainerAppConsoleLogs`、`ContainerAppSystemLogs` |
| `applicationInsightsName` | Application Insights | 文字列 | **必須** | |
| `actionGroups[]` | 通知先 | `{ key, name, shortName, emailReceivers: [{ name, emailAddress, useCommonAlertSchema }] }` | — | `features.alerting` のときだけ作る。`key` で参照する |
| `tags` | タグ | マップ | — | |

### アラート（`azureAlertingConfig`、機能 `alerting`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `logAlerts[]` | ログ検索のアラート | `scopes` / `actionGroups` を除いた `AzureLogAlertDefinition` に、`scopes?`、`notify?: string[]` を加えたもの | `[]` | `notify`: `actionGroups` のキー。`key?` でアドレスを固定する |
| `metricAlerts[]` | メトリクスのアラート | `scopes` / `actionGroups` を除いた `AzureMetricAlertDefinition` に、`target?: { type: "containerApp", name }`、`scopes?`、`notify?` を加えたもの | `[]` | 項目は `constructs/observability/azuremonitor.ts` を参照 |

### ログのアーカイブ（`azureLogArchiveConfig`、機能 `logArchive`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `deleteOnDestroy` | destroy のときにアカウントとログを削除する | `boolean` | `true` | |
| `storageAccount.name` | ストレージアカウント | 小文字の英字と数字で 3〜24 文字 | `logArchive` が有効なときは**必須** | 全世界で一意。`byEnv` / `envScopedName` を使う |
| `storageAccount.replication` | レプリケーション | `LRS`、`GRS`、`RAGRS` | `LRS` | アーカイブ層は `ZRS` に対応しない |
| `storageAccount.infrastructureEncryption` | 二重の暗号化 | `boolean` | `false` | 作成時にしか設定できない。変えるとアカウントが作り直され、ログが削除される |
| `storageAccount.lifecycle` | `{ toCoolDays?, toArchiveDays?, deleteDays? }` | 日数 | `30`、`90`、`365` | |
| `acaEnvironments` | アーカイブする環境 | `environmentName` | `logs: true` のすべての環境 | |

## プライベート DNS（`privatezone.ts`、`azurePrivateZoneParams`、`hostZones` が有効なとき）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `resourceGroup`、`location` | | | | |
| `dnsResolverInboundSubnetCidr`、`dnsResolverInboundSubnetName`、`dnsResolverOutboundSubnetCidr`、`dnsResolverOutboundSubnetName` | Resolver のサブネット | CIDR（`/28` 以上）、名前 | `10.2.120.0/28`、`10.2.121.0/28` | NSG `azure-dns-resolver-nsg` が付く |
| `dnsPrivateResolverName`、`inboundEndpointName`、`outboundEndpointName` | Resolver の名前 | 文字列 | | |
| `forwardingRulesetName`、`forwardingRulesetVnetLinkName` | ルールセットの名前 | 文字列 | | |
| `forwardingRules[]` | ほかのクラウドに転送するドメイン | `{ name, domainName（末尾にドット）, enabled, target: "aws" \| "google" }` | `aws.inner.`、`google.inner.`、`efs.<リージョン>.amazonaws.com.` | Azure から EFS のマウントターゲットを名前解決するには、EFS のルールが必要 |
| `azureInnerDomain` | プライベートゾーン `azure.inner` | `{ zoneName, vnetLinkName, enabled, cnameRecords[] }` | `azure.inner` | DB、Files、アプリの CNAME は、それぞれの `cnameRecordName` から作られる |
| `tags` | タグ | マップ | | |

## VPN（`vpn.ts`、`azureVpnparams`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `gatewaySubnetCidr` | `GatewaySubnet` | CIDR（`/27` 以上） | `10.2.100.0/24` | |
| `vpnGatewayName` | VPN ゲートウェイ | 文字列 | **必須** | |
| `publicIpNames`、`ipConfigurationNames` | ゲートウェイのインスタンスごとのパブリック IP と IP 構成 | 2 つの文字列 | **必須** | |
| `publicIpZones` | パブリック IP のゾーン | `["1","2","3"]` または `[]` | `["1","2","3"]` | AZ の SKU では必須 |
| `pipAlloc` | 割り当て方法 | `Dynamic`、`Static` | `Dynamic` | |
| `sku` | ゲートウェイの SKU | `VpnGw1AZ` など | `VpnGw1AZ` | |
| `type`、`vpnType`、`vpnConnectionType` | | `Vpn`、`RouteBased`、`IPsec` | | |
| `azureAsn` | Azure 側の BGP の ASN | 数値 | `65515` | |
| `logs`、`diagnosticSettingName`、`retentionInDays` | ゲートウェイのログを Log Analytics に送る | `boolean`、文字列、日数 | `true` | `AzureDiagnostics` テーブルの保存期間は `tableRetention` |
| `localNetworkGateways.<aws\|google>` | トンネルの順番の `gatewayNames`、`connectionNames` | 文字列 | `<PROJECT_NAME>-azure-lng-<相手>-<n>` / `-vpn-connection-<相手>-<n>` | AWS は 4 つ、Google は 2 つ |
| `vpnGwtags`、`localGwtags` | タグ | マップ | | |
