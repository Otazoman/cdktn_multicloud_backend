# Google Cloud の設定

[English](google.md)

ディレクトリ: `config/google/`（`googlesettings.ts` がまとめて export）。機能の ON/OFF は [common.ja.md](common.ja.md#クラウドと機能の切り替えclouds) にあります。共通の決まり（`build`、`key`、名前での参照）は [README.ja.md](README.ja.md) にあります。

## 共通（`common.ts`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `PROJECT_NAME` | 環境の Google Cloud のプロジェクト ID。すべてのリソースの `project` と provider で使う | プロジェクト ID の文字列、`byEnv` | `dev`: `multicloud-sitevpn-project`、`stg`・`prod`: 空 | 環境ごとに**必須**。Google Cloud が有効なのに空だと synth が止まる。`config/naming.ts` の名前の接頭辞 `PROJECT_NAME` とは別物 |
| `LOCATION` | リージョン | リージョンコード | `asia-northeast1` | |
| `PUBLIC_DOMAIN` | 公開 DNS のドメイン。LB のホスト名（`api.<ドメイン>`）、マネージド証明書のドメイン、公開ゾーンはここから作られる | ドメインの文字列、`byEnv` | すべての環境で `googletest.tohonokai.com` | `features.dns` または HTTPS のパターンを使うときだけ使われる |

## VPC（`vpc/vpc.ts`、`vpc/subnets.ts`、`vpc/firewallRules.ts`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `vpcName` | VPC の名前 | 文字列 | `multicloud-gcp-vpc` | |
| `vpcCidrblock` | VPC の CIDR（ファイアウォールと VPN のルートで使う） | CIDR | `10.1.0.0/16` | AWS / Azure と重ならないこと |
| `vpcLabels` | ラベル | マップ | — | |
| `subnets[]` | サブネット: `{ name, resourceName, cidr, region, labels? }` | | **必須** | `name`（例: `app-subnet`）で参照する。`resourceName` が実際の名前（インスタンスから参照するときは VPC の名前が前に付く） |
| `proxySubnets[]` | リージョンの LB 用のプロキシ専用サブネット: `{ name, resourceName, cidr, region }` | | `10.1.110.0/24` | リージョンの外部アプリケーション LB に必要 |
| `firewallIngressRules[]` | 受信のルール: `{ name, resourceName, permission: { protocol, ports? }, sourceRanges, priority }` | `protocol`: `tcp`、`udp`、`all` など | **必須** | クラウド間の CIDR と、PostgreSQL（5432）、NFS（2049、111、20048）をここに書く |
| `firewallEgressRules[]` | 送信のルール: 受信と同じ形に `destinationRanges` を加えたもの | | **必須** | |
| `natConfig.enable` | Cloud NAT | `boolean` | `true` | |
| `natConfig.name`、`ipName`、`routerName`、`region` | NAT、アドレス、ルーターの名前 | 文字列 | | |

## GCE（`gce.ts`、`gceInstancesParams`、機能 `vms`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `project` | プロジェクト | `PROJECT_NAME` | | |
| `instanceConfigs[].build` | 作る | `boolean` | **必須** | |
| `name`、`key` | インスタンスの名前、アドレスのキー | 文字列 | **必須**、key = `name` | |
| `machineType`、`zone` | サイズとゾーン | 文字列 | **必須** | |
| `tags`、`labels` | ネットワークタグ、ラベル | `string[]`、マップ | `tags` は**必須** | |
| `bootDiskImage`、`bootDiskSize`、`bootDiskType`、`bootDiskDeviceName` | ブートディスク | イメージのパス、GiB、`pd-standard` など、文字列 | **必須** | |
| `subnetworkName` | サブネット | サブネットの `name` | **必須** | |
| `serviceAccountScopes` | 既定のサービスアカウントの OAuth スコープ | URL | **必須** | |
| `startupScriptPath` | 起動スクリプト | パス | — | `./scripts/vm_init.sh` |

## プライベート サービス アクセス（`psa.ts`、`googlePsaConfig`）

1 つのピアリング接続に、重ならない予約範囲を複数登録します。

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `psaConstructId` | 1 つだけ作るリソースの construct ID | 文字列 | `google-psa` | deploy 後は変えないこと |
| `isExisting` | 作らずに既存のアドレスを参照する | `boolean` | `false` | |
| `serviceRanges.cloudSql[]` | Cloud SQL の範囲 | `{ rangeName, address, prefixLength, key? }` | `10.100.16.0/20` | |
| `serviceRanges.filestore[]` | Filestore の範囲 | 同上 | `10.100.10.0/24`、`10.100.11.0/24` | `rangeName` は `filestore.ts` の `reservedIpRange` と同じであること。BASIC のインスタンスには最低 /29 が必要 |
| `serviceRanges.cloudbuild[]` | Cloud Build のプライベートプールの範囲 | 同上 | `10.110.0.0/16` | |

## Cloud SQL（`cloudsql/cloudsql.ts`、`cloudSqlConfig`、機能 `dbs`）— PostgreSQL のみ

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `project` | プロジェクト | `PROJECT_NAME` | | |
| `instances[].build` | 作る | `boolean` | **必須** | |
| `name` | インスタンスの名前 | 文字列 | **必須** | 削除した名前は約 1 週間再利用できない。サンプルの名前には日付が付いている |
| `aRecordName` | プライベートゾーン `google.inner` の A レコード | FQDN | — | |
| `edition` | エディション | `ENTERPRISE`、`ENTERPRISE_PLUS` | **必須** | `ENTERPRISE_PLUS` には `db-perf-optimized-*` のティアが必要 |
| `databaseVersion` | バージョン | 例: `POSTGRES_18` | **必須** | |
| `tier` | マシンのティア | 例: `db-custom-2-8192` | **必須** | |
| `region` | リージョン | | **必須** | |
| `availabilityType` | 可用性 | `ZONAL`、`REGIONAL` | **必須** | |
| `diskType`、`diskSize`、`diskAutoresize`、`diskAutoresizeLimit` | ディスク | `PD_SSD`/`PD_HDD`、GiB、`boolean`、GiB | **必須** | |
| `username`、`password` | 管理者ユーザー | `GOOGLEDB_ROOT_USER`、`GOOGLEDB_ROOT_PASSWORD` から | | |
| `managedPasswordEnabled` | パスワードを Google が管理する | `boolean` | **必須** | |
| `privateNetwork` | PSA を通したプライベート IP | `boolean` | **必須** | |
| `authorizedNetworks` | 許可するパブリックのネットワーク | CIDR の一覧 | **必須**（`[]`） | |
| `backupEnabled`、`backupStartTime`、`backupRetainedBackups`、`backupTransactionLogRetentionDays` | バックアップ | `boolean`、`HH:MM`（UTC）、個数、日数 | **必須** | |
| `pointInTimeRecoveryEnabled` | ポイントインタイム リカバリ | `boolean` | — | |
| `maintenanceWindowDay`、`maintenanceWindowHour`、`maintenanceUpdateTrack` | メンテナンス | 1（月）〜7、0〜23、`stable`、`canary`、`week5` | **必須** | |
| `highAvailabilityEnabled` | 高可用性 | `boolean` | **必須** | |
| `insightsEnabled`、`queryStringLength`、`recordApplicationTags`、`recordClientAddress` | Query Insights | `boolean`、数値、`boolean`、`boolean` | **必須** | |
| `deletionProtection` | 削除保護 | `boolean` | **必須** | `true` では destroy できない |
| `labels` | ラベル | マップ | **必須** | |
| `databaseFlagsFile` | DB のフラグのファイル | パス | — | `postgres-parameters.ts` は `postgresDatabaseFlags[]` `{ name, value }` を export する。アクティブ / アクティブのために `cloudsql.logical_decoding=on` を設定している |

## Filestore（`filestore.ts`、`filestoreConfigs`、機能 `storage`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `project` | プロジェクト | `PROJECT_NAME` | | |
| `instances[].build` | 作る | `boolean` | **必須** | |
| `name`、`key` | 名前、アドレスのキー | 文字列 | **必須**、key = `name` | |
| `location` | ゾーン | 例: `asia-northeast1-a` | **必須** | |
| `tier` | ティア | `BASIC_HDD`、`BASIC_SSD`、`HIGH_SCALE_SSD`、`ENTERPRISE`、`ZONAL`、`REGIONAL` | **必須** | |
| `fileShare.name`、`fileShare.capacityGb` | 共有 | 文字列、GiB | **必須** | |
| `networkName` | VPC | `vpcName` | **必須** | |
| `connectMode` | 接続方式 | `DIRECT_PEERING`、`PRIVATE_SERVICE_ACCESS` | provider の既定 | |
| `reservedIpRange` | PSA の範囲の名前 | `psa.ts` の `rangeName` | — | |
| `aRecordName` | `google.inner` の A レコード | FQDN | — | |
| `labels` | ラベル | マップ | — | |

## シークレット（`secrets.ts`、`googleSecretsConfig`、機能 `dbs`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `project` | プロジェクト | `PROJECT_NAME` | | |
| `initialValue` | 最初のバージョンのダミーの値 | 文字列 | `CHANGE_ME` | state に残る。本当の値は `gcloud` で新しいバージョンとして追加する（[operations.ja.md](../operations.ja.md) を参照） |
| `secrets[].key` | キー | 文字列 | **必須** | |
| `secrets[].name` | シークレットの ID | 文字列 | `<PROJECT_NAME>-google-secret-<key>` | |
| `secrets[].description` | 説明 | 文字列 | **必須** | |

## コンテナ（機能 `containers`）

### Cloud Run（`cloudrun.ts`、`gcpRunConfigs[]`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build` | 作る | `boolean` | **必須** | |
| `name`、`key` | サービスの名前、アドレスのキー | 文字列 | **必須**、key = `name` | |
| `project`、`location` | プロジェクトとリージョン | | **必須** | |
| `image` | コンテナイメージ | 文字列 | **必須** | |
| `port` | コンテナのポート | 数値 | **必須** | |
| `cpu`、`memory` | リソース | `"1"`、`"0.5"`、`"512Mi"` | `"0.5"`、`"256Mi"` | |
| `minInstances`、`maxInstances` | スケーリング | 数値 | `0`、`3` | |
| `maxInstanceRequestConcurrency` | インスタンスあたりの同時リクエスト数 | 数値 | `80` | |
| `cpuAlwaysAllocated` | リクエストの間も CPU を割り当てたままにする | `boolean` | `false` | |
| `allowUnauthenticated` | 誰でも呼び出せる（`allUsers`） | `boolean` | `false` | |
| `useLb` | ロードバランサー経由でだけ到達できる | `boolean` | `false` | `true`: 上り（ingress）は `INTERNAL_LOAD_BALANCER`、`false`: すべてのトラフィック |
| `subnetworkName` | ダイレクト VPC 下りのサブネット | サブネットの `resourceName` | — | |
| `logs`、`logBucket` | ログをログバケットに送る | `boolean`、`cloudlogging.ts` のキー | — | `logs: false` は `_Default` から除外するだけ |

### Cloud Load Balancing（`cloudloadbalancing.ts`、`gcpLbConfigs[]`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build` | 作る | `boolean` | **必須** | HTTP、リージョンの HTTPS、グローバルの HTTPS を別の項目として残し、`build` で切り替える |
| `name`、`key` | LB の名前、アドレスのキー | 文字列 | **必須**、key = `name` | |
| `names` | `staticIp`、`proxy`、`forwardingRule` の名前 | 文字列 | `<PROJECT_NAME>-google-lb-ip-<name>` など | |
| `project`、`region` | | | **必須** | |
| `loadBalancerType` | 範囲 | `"REGIONAL"`、`"GLOBAL"` | **必須** | リージョンの LB にはプロキシ専用サブネットが必要 |
| `protocol`、`port` | フロントエンド | `"HTTP"`、`"HTTPS"`、数値 | **必須** | |
| `reserveStaticIp` | IP を予約する | `boolean` | **必須** | |
| `networkTier`、`loadBalancingScheme` | | `PREMIUM`、`EXTERNAL_MANAGED` | provider の既定 | |
| `dnsConfig.subdomain`、`dnsConfig.fqdn` | 公開ゾーンとレコード | 文字列 | — | `PUBLIC_DOMAIN` から作る。`features.dns` で A レコードを作る |
| `managedSsl` | 証明書 | `{ certificateName?, domains, certificatePath?, privateKeyPath? }` | — | ファイルを指定: 自己管理の証明書をアップロード（リージョン）。ファイルなし: Google マネージド（グローバル）。名前の既定は `<PROJECT_NAME>-google-ssl-certificate-<LB の名前>` |
| `sslCertificateNames` | 既存の証明書 | 名前 | — | |
| `backends[]` | バックエンド | `{ name, key?, names?: { serverlessNeg?, healthCheck? }, protocol, loadBalancingScheme, timeoutSec?, cloudRunServiceName?, healthCheck?: { requestPath, port } }` | **必須** | `cloudRunServiceName` は作成する Cloud Run のサービスと一致すること |
| `defaultBackendName` | 既定のバックエンド | `backends[].name` | **必須** | |
| `hostRules[]`、`pathMatchers[]` | ホスト / パスでのルーティング | `{ hosts, pathMatcher }`、`{ name, defaultBackendName, pathRules: [{ paths, backendName }] }` | — | |
| `gcpPublicZoneNames` | ドメインごとの公開ゾーンのリソース名 | マップ | `<PROJECT_NAME>-google-public-zone-<ドメイン>` | |

## CI/CD（`cicdsettings.ts`、`googleCicdConfigs[]`、機能 `cicd`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build`、`name`、`project` | 作る、パイプラインの名前、プロジェクト | | **必須** | |
| `artifactRegistry.repositoryId`、`location`、`format`、`description` | Artifact Registry | 文字列。`format`: `DOCKER` など | `description` 以外は**必須** | |
| `cloudbuildPrivatePool.workerPoolName`、`location`、`key?` | プライベートプール | 文字列 | **必須** | PSA の `cloudbuild` の範囲が必要 |
| `cloudbuildPrivatePool.machineType` | マシンタイプ | 文字列 | `e2-standard-2` | |
| `cloudbuildPrivatePool.diskSizeGb` | ディスク | GiB | `100` | |
| `cloudbuildPrivatePool.peeredNetworkIpRange` | ピアリング内の範囲 | CIDR または空 | provider が選ぶ | |
| `githubTrigger.build` | トリガーを作る | `boolean` | — | |
| `githubTrigger.name`、`key` | トリガーの名前、アドレスのキー | 文字列 | **必須**、key = `name` | |
| `githubTrigger.connectionName` | Cloud Build の GitHub 接続（第 2 世代） | 名前 | **必須** | deploy の前に gcloud で作って承認する。リージョンは `cloudbuildPrivatePool.location`（[getting-started.ja.md](../getting-started.ja.md)） |
| `githubTrigger.repositoryName`、`remoteUri` | 接続に登録するリポジトリ | 名前、HTTPS の URL | `appRepository`（`config/cicd.ts`） | |
| `githubTrigger.filename` | リポジトリ内のビルドの定義 | パス | `cloudbuild.yaml` | |
| `githubTrigger.serviceAccountId` | ビルドを実行するサービスアカウント（cdktn が作る） | 6〜30 文字 | `cloudbuild-deployer` | `logging.logWriter`、`cloudbuild.workerPoolUser`（プロジェクト）、`artifactregistry.writer`（リポジトリ）が付く |
| `githubTrigger.deployTarget.cloudRunServiceName` | ビルドがデプロイする Cloud Run のサービス | `cloudrun.ts` のサービスの `name`（`build: true`） | — | `_SERVICE` として渡す。サービスアカウントには、そのサービスへの `run.developer` と、既定の Compute のサービスアカウントへの `iam.serviceAccountUser` が付く。そのサービスのイメージは Terraform が無視する。指定しないと、`cloudbuild.yaml` はデプロイの手順で失敗する |
| トリガーのブランチ | push でビルドを起動するブランチ | `config/cicd.ts` の `cicdTrigger.branches` | `main` | `_REGION`、`_AR_REPOSITORY`、`_WORKER_POOL` は常に渡す |
| `tags` | ラベル | マップ | — | |

## ログ（`cloudlogging.ts`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `googleUseLogBuckets` | `logs: true` のリソースのログを、下のログバケットに送る | `boolean`、`byEnv` | `dev`: `false`、ほか: `true` | `false`: ログバケットとシンクを作らず、ログは `_Default`（30 日）に残る。destroy から 7 日以内にもう一度 deploy する環境向け（削除したバケットの ID は 7 日間再利用できないため） |
| `googleLogBucketsConfig[].key` | `logBucket` から参照するキー | 文字列 | **必須** | 参照されたバケットだけが作られる |
| `bucketId` | バケットの ID | 文字列 | `<PROJECT_NAME>-google-logs-<key>` | 削除した ID は 7 日間再利用できない |
| `location` | ロケーション | リージョン | **必須** | 作成後は変えられない |
| `retentionDays` | 保存期間 | 1〜3650 | **必須** | 30 日を超えると課金される |
| `enableAnalytics` | Observability Analytics | `boolean` | `false` | 一度有効にすると無効にできない |
| `googleLogRouteNames` | 経路（`vpn`、`cloudrun-<サービス>`）ごとのシンクと除外の名前 | `{ sinkName?, exclusionName? }` | `<PROJECT_NAME>-google-log-sink-<経路>` / `-log-exclusion-<経路>` | |

## 監視（`monitoring.ts`）

### アラート（機能 `alerting`、`googleAlertingConfig`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `notificationTargets[]` | メールの通知チャネル | `{ key, name?, emails[] }` | `[]` | `name` の既定は `<PROJECT_NAME>-google-alerts-<key>` |
| `logMetrics[]` | ログベースのメトリクス | `GcpLogMetricDefinition`（`constructs/observability/googlecloudmonitoring.ts` を参照） | `[]` | メトリクスの種類は `logging.googleapis.com/user/<name>` |
| `alertPolicies[]` | アラートポリシー | `notificationChannels` を除いた `GcpAlertPolicyDefinition` に、`notify?: string[]` を加えたもの | `[]` | `notify`: `notificationTargets` のキー。ファイルの先頭に例がある |

### ログのアーカイブ（機能 `logArchive`、`googleLogArchiveConfig`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `deleteOnDestroy` | destroy のときにバケットとログを削除する | `boolean` | `true` | |
| `bucket.name` | Cloud Storage のバケット | 全世界で一意な文字列 | `logArchive` が有効なときは**必須** | 環境ごとの名前は `byEnv` で書く |
| `bucket.location` | ロケーション | リージョン | `LOCATION` | |
| `bucket.lifecycle` | ストレージクラスの変更 / 削除 | `{ toArchiveClassDays?, deleteDays? }` | `30`、`365` | |
| `sinkName` | ログシンク | 文字列 | `<PROJECT_NAME>-google-log-archive` | |
| `cloudRunServices` | アーカイブするサービス | 名前 | 作成したすべてのサービス | |
| `filter` | 代わりに使うログのクエリ | 文字列 | — | |
| `labels` | ラベル | マップ | — | |

## プライベート DNS（`privatezone.ts`、`googlePrivateZoneParams`、`hostZones` が有効なとき）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `enableForwarding` | ほかのクラウドのプライベートドメインを転送する | `boolean` | `true` | |
| `forwardingDomains` | ドメイン | 文字列 | Azure の PostgreSQL / Private Link / Azure Files のドメイン、`azure.inner`、`aws.inner` | |
| `forwardingZoneNames`、`privateZoneNames` | ドメインごとのゾーンの名前 | マップ | `<PROJECT_NAME>-google-forwarding-zone-<ドメイン>` / `-private-zone-<ドメイン>` | 相手の DNS に到達できるときは転送ゾーン、そうでなければプライベートゾーン |
| `forwardingZoneDescription`、`privateZoneDescription`、`labels` | 説明とラベル | | | |
| `inboundServerPolicyName` | AWS / Azure からの問い合わせを受け付けるポリシー | 文字列 | `gcp-resolver-inbound` | |
| `cloudSqlARecords`、`filestoreARecords` | 短い名前のゾーン `google.inner` | `{ internalZoneName, zoneResourceName, zoneDescription }` | `google.inner` | 2 つで 1 つのゾーンを共有する |

## VPN（`vpn.ts`、`googleVpnParams`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `logs`、`logBucket` | VPN と Cloud Router のログ | `boolean`、`cloudlogging.ts` のキー | `true`、`vpn` | |
| `vpnGatewayName`、`connectDestination` | ゲートウェイの名前、共有のゲートウェイのラベル | 文字列 | **必須** | |
| `gatewayIpName`、`forwardingRuleNames` | トンネル 1 本（Classic VPN）のアドレスと、ルール `esp`、`udp500`、`udp4500` | 文字列 / マップ | | `singleTunnel` のみ |
| `haIpNames` | HA VPN のアドレス（2 つ） | 文字列 | | `haBgp` のみ |
| `peers.<aws\|azure>` | 相手ごとの名前: `externalGatewayName`、`tunnelNames`、`routeNames`（静的ルート、`singleTunnel` のみ）、`routerInterfaceNames`、`routerPeerNames` | 文字列。順番どおりに使う | `<PROJECT_NAME>-google-<種類>-<相手>-<n>` | AWS はトンネル 4 本（接続 2 つ × トンネル 2 本） |
| `cloudRouterName` | Cloud Router | 文字列 | **必須** | |
| `bgpGoogleAsn` | Google 側の BGP の ASN | 数値 | `65000` | |
| `ikeVersion` | IKE のバージョン | `1`、`2` | `2` | |
| `customIpRanges` | ルーターが広告する範囲 | CIDR の一覧 | `10.100.0.0/16`、`35.199.192.0/19` | Cloud SQL / Filestore（PSA）と Google の DNS |
| `labels` | ラベル | マップ | — | |
