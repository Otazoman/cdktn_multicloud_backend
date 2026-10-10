# FEAT-03 監視・オートスケーリング 設計方針

- 作成日: 2026-10-04
- 改訂日: 2026-10-10（ユーザー回答を反映。ON/OFF の単位、ログのアーカイブ、通知先の設定化、Slack 対応の余地、Azure ログアラートの新 API、Container Apps のログの既定 ON）
- ステータス: **設計方針確定（2026-10-10。§8 すべて決定）。段階1〜6 完了（2026-10-10）。残りは将来対応（Slack 通知 §6.3、ステップスケーリング、VM のスケールグループ化 §8 #1）**
- 関連: `docs/ai/vpn_refactor_plan.md` の FEAT-03（今後の FEAT-03 の検討・記録はこの文書に集約する）

## 1. 目的

1. コンテナ（ECS / Cloud Run / Container Apps）のログ取得・オートスケーリング・アラートを設定ファイルで制御できるようにする。
2. コンテナのログをアーカイブ用のストレージ（S3 / GCS / Azure Storage）へ退避できるようにする。
3. **アラート**と**ログのアーカイブ**は、他の機能と同じくクラウドごとに ON/OFF できるようにする。
4. 機能フラグや名前の設定など、これまでの再構成で決めたルールに従う
   （機能は VPN に依存させない、名前は設定ファイルから、など）。

## 2. 現状（2026-10-10 時点）

| 項目 | AWS（ECS） | Google Cloud（Cloud Run） | Azure（Container Apps） |
|---|---|---|---|
| ログ取得 | ✅ `cloudwatchlogs.ts` のロググループへ `awslogs` で出力 | △ Cloud Logging の `_Default` バケット（30日）に自動で入る。コードでの設定なし | ❌ 環境に Log Analytics を紐付けていないため、ログはストリーミングのみで保存されない |
| オートスケーリング | ✅ CPU / メモリのターゲット追跡（サービスごとに `autoScaling.enabled`） | △ 最小 / 最大インスタンスのみ | △ 最小 / 最大レプリカのみ（construct は対応済みだが `containerapps.ts` に項目がなく、常に 0〜10） |
| アラート | △ construct はあるが設定が空。アラームに `dimensions` がなく、ECS サービス単位のメトリクスを指定できない。通知先（SNS）を作る仕組みがない | ❌ construct（`GcpMonitoringResources`）は未使用。集計方法が `ALIGN_RATE` 固定 | △ アクショングループ（メール）のみ。アラートの設定なし |
| ログのアーカイブ | ❌ なし | ❌ なし | ❌ なし |
| ON/OFF | CloudWatch は常に作成 | なし | `useVpn && azureMonitorConfig.isEnabled`（VPN 依存。ARC-10 の方針と矛盾） |

補足: `ecs.ts` の `logRetentionInDays` はどこからも使われていない（保持期間は `cloudwatchlogs.ts` 側で決まる）。

## 3. ON/OFF の方針

### 3.1 フラグの単位

| 対象 | 制御方法 | 理由 |
|---|---|---|
| ログ取得 | **フラグは追加しない**。各リソースの設定で決める（AWS: `cloudwatchlogs.ts`、Azure: Container Apps 環境のログ設定（§4.3）、Google: 自動） | ログはリソースごとに設定済み / 設定可能なため |
| オートスケーリング | **フラグは追加しない**。各ワークロードの設定（`ecs.ts` の `autoScaling` と同じ形）で決める | 同上 |
| アラート | **`clouds.<cloud>.features.alerting` を追加** | 通知先とアラームをまとめて ON/OFF したい |
| ログのアーカイブ | **`clouds.<cloud>.features.logArchive` を追加** | アーカイブ用ストレージと転送の仕組みをまとめて ON/OFF したい |

```ts
// config/commonsettings.ts（追加分のみ）
export interface CloudFeatures {
  // ...既存...
  /** Notification targets and alarms / alert policies */
  alerting: boolean;
  /** Archive container logs to object storage (S3 / GCS / Azure Storage) */
  logArchive: boolean;
}
```

- 読み取りは既存どおり `isFeatureEnabled(cloud, "alerting")` / `isFeatureEnabled(cloud, "logArchive")`。
- `clouds.<cloud>.enabled` が false なら両方とも作らない（既存の動き）。
- **既定値は今の合成結果を再現する**:

| | aws | google | azure |
|---|---|---|---|
| `alerting` | false（今もアラームなし） | false | **true**（今アクショングループが作られているため） |
| `logArchive` | false | false | false |

### 3.2 フラグに含めるもの・含めないもの

| | `alerting` に含める | `alerting` に含めない（常に / 他の設定で作る） |
|---|---|---|
| AWS | SNS トピック・購読、メトリクスフィルター、CloudWatch アラーム | ロググループ（RDS / ECS / VPN が参照しているため） |
| Google | 通知チャネル、ログベースのメトリクス、アラートポリシー | — |
| Azure | アクショングループ、メトリクスアラート、ログアラート | Log Analytics ワークスペース（VPN の診断設定・Container Apps のログで使うため） |

- ECS のターゲット追跡スケーリングが自動で作るアラームは対象外（Application Auto Scaling が管理するため）。
- Azure の Log Analytics ワークスペースは `azureMonitorConfig.isEnabled` だけで作るようにし、**`useVpn` 依存をなくす**。今は `useVpn = true` のため、合成結果は変わらない。

## 4. ログ取得（段階4）

### 4.0 方針

- **ログの出力 ON/OFF と保持期間は、各リソースの設定で決める**（AWS の「リソースごとのロググループ」の形に揃える）。
- 各リソースの設定に `logs: boolean` を置く（VPN・コンテナとも）。既定値は今の動きを再現する（今ログが出ているものは `true`）。
- 保持期間は「ログの置き場所」ごとに設定する（AWS: ロググループ、Google: ログバケット、Azure: Log Analytics のテーブル）。

| | 出力の ON/OFF | 置き場所 | 保持期間の単位 |
|---|---|---|---|
| AWS | 各リソースの `logs`（VPN は今 `logEnabled: true` 固定 → 設定化） | ロググループ（`cloudwatchlogs.ts`） | ロググループごと |
| Google | 各リソースの `logs`。OFF は `_Default` からの除外で実現（§4.2） | **用途ごとのログバケット**（新規） | **バケットごと** |
| Azure | 各リソースの `logs`（VPN は今ワークスペースの有無で決まる → 設定化） | 1つの Log Analytics ワークスペース（§8 #10） | **テーブルごと**（§4.3） |

### 4.1 AWS

| 対象 | 変更 |
|---|---|
| VPN | `config/aws/vpn.ts` の `customerGateways.<接続先>` に `logs`（既定 true）を追加し、トンネルの `logEnabled` に渡す。未使用の `logRetentionDays` を削除（保持期間は `cloudwatchlogs.ts`） |
| ECS | 変更なし（ロググループは必須）。未使用の `logRetentionInDays` を削除（§8 #6） |

### 4.2 Google Cloud（用途ごとのログバケット）

調査結果（§4.4）を踏まえ、`_Default` バケット（30日固定の共用）から、用途ごとのログバケットへ振り分ける。

```ts
// config/google/cloudlogging.ts（新規。AWS の cloudwatchlogs.ts に相当）
// Location cannot be changed after creation; retention > 30 days is charged.
// enableAnalytics cannot be turned off once enabled.
export const googleLogBucketsConfig = [
  { key: "vpn", bucketId: undefined, location: LOCATION, retentionDays: 30, enableAnalytics: false },
  { key: "cloudrun", bucketId: undefined, location: LOCATION, retentionDays: 30, enableAnalytics: false },
];

// config/google/vpn.ts（追加）
logs: true, logBucket: "vpn",

// config/google/cloudrun.ts（各サービスに追加）
logs: true, logBucket: "cloudrun",
```

| リソース | 振り分けるログ（フィルター） |
|---|---|
| VPN | `resource.type="vpn_gateway"`（VPN ゲートウェイ）と `resource.type="gce_router"`（BGP。Cloud Router） |
| Cloud Run | `resource.type="cloud_run_revision" AND resource.labels.service_name="<サービス名>"` |

作るリソース:

| `logs` | 作るもの | 結果 |
|---|---|---|
| true | ログバケット（`google_logging_project_bucket_config`、`retentionDays` を設定）、そのバケットへのシンク（`google_logging_project_sink`）、`_Default` からの除外（`google_logging_project_exclusion`） | 用途ごとのバケットにだけ保存（二重に保存・課金されない） |
| false | `_Default` からの除外のみ | 保存されない（取り込みの課金もなし） |

- 除外は `_Default` シンクにだけ効く。アーカイブ用のシンク（§5.2、GCS）には影響しないため、`logs: false` でもアーカイブはできる。
- 監査ログ（`_Required`）は除外できない仕様で、今回の対象でもない。
- `gce_router` はプロジェクト内のすべての Cloud Router が対象になる（今は VPN 用と Cloud NAT 用。NAT のログは別の種類 `nat_gateway` で、対象外）。
- `retentionDays` は 1〜3650日。30日を超える分は保持の課金がある。
- **注意（destroy → 再作成）**: 削除したログバケットは7日間「削除待ち」になり、**同じ ID のバケットを7日間作れない**。destroy 後7日以内に deploy し直すと失敗する。対策は §8 #13。
- バケットのリージョンは作成後に変えられない（変えると作り直し）。

既定値は Google のベストプラクティスに合わせる（2026-10-10 決定、§8 #15）:

| ベストプラクティス | 既定値・設計 |
|---|---|
| 別の場所へ振り分けたログは `_Default` シンクで除外する（二重の保存・課金を防ぐ）。振り分け自体は無料、保存はバケットごとに課金 | 振り分け（シンク）と除外を必ず組で作る |
| 30日を超える保持は課金 | `retentionDays: 30` |
| `global` / マルチリージョンは単一リージョンより耐障害性が高いわけではない。データの保管場所の要件で選ぶ（作成後は変更不可） | 両バケットとも `LOCATION`（asia-northeast1） |
| バケットを用途ごとに分けることは特に勧めていない（アクセス制御はログビュー） | バケットは保持期間の要件の単位とする。`vpn` / `cloudrun` の2つ（複数リソースで共有も可） |
| Observability Analytics へのアップグレードは元に戻せない | `enableAnalytics` を設定項目にし、既定 false |
| ロック・CMEK は作成後に変更不可 | 設定項目にしない |
| 振り分け先を削除するときはシンクも削除する | Terraform で組にして管理 |

### 4.3 Azure

| 対象 | 変更 |
|---|---|
| VPN | `config/azure/vpn.ts` に `logs`（既定 true）を追加。true のときだけ診断設定を作る。true なのにワークスペースがない場合はエラーにする（今は黙って作らない） |
| Container Apps | 下記（環境ごとの `logs`） |
| 保持期間 | `azureMonitorConfig.tableRetention` にテーブルごとの日数を書く（`azurerm_log_analytics_workspace_table` 系のリソース。実装時にどちらのリソースを使うか確認する）。書かないテーブルはワークスペースの既定（30日） |

```ts
// config/azure/azuremonitor.ts（追加）
tableRetention: {
  AzureDiagnostics: 14,          // VPN gateway logs (§4.4)
  ContainerAppConsoleLogs: 30,
  ContainerAppSystemLogs: 30,
},
```

Container Apps 環境のログは、すべての環境に共通の既定値と、環境（`environmentName`）ごとの上書きで決める。
環境はアプリの設定から暗黙に作られるため、既存の環境名に限らず、新しく追加した環境にも既定値が効く。

```ts
// config/azure/containerapps.ts（追加）
/** Applied to every Container Apps environment unless overridden below */
export const azureAcaEnvironmentDefaults = { logs: true };
/** Per-environment overrides, keyed by environmentName (optional) */
export const azureAcaEnvironmentSettings: Record<string, { logs?: boolean }> = {
  // "some-env": { logs: false },
};
```

- 実装方法は **`logs_destination = "azure-monitor"` + 診断設定**とする。
  - 診断設定（`azurerm_monitor_diagnostic_setting`）で、`ContainerAppConsoleLogs` / `ContainerAppSystemLogs` を Log Analytics へ送る（リソース固有のテーブル）。
  - アーカイブが ON のときは、**同じ診断設定**の送信先にストレージアカウントを加える（§5.3）。
  - `"log-analytics"`（直接連携）にしない理由: この方式では診断設定が使えず、ストレージへの退避ができないため。
- `logs: true` の環境があるのにワークスペースがない場合は、合成時にエラーにする。
- 既存の2環境（`public-main-env` / `main-env`）も設定が変わる（§8 #9）。`cdktn diff` で作り直しにならないことを確認する（ユーザー実行）。

### 4.4 調査結果（2026-10-10）

| # | 調べたこと | 結果 | 出典 |
|---|---|---|---|
| 1 | Azure VPN ゲートウェイのログはどのテーブルに入るか | **`AzureDiagnostics` のみ**（GatewayDiagnosticLog / TunnelDiagnosticLog / RouteDiagnosticLog / IKEDiagnosticLog の4種とも）。リソース固有のテーブルには対応していない。メトリクスは `AzureMetrics` | [Monitoring data reference for Azure VPN Gateway](https://learn.microsoft.com/azure/vpn-gateway/monitor-vpn-gateway-reference) |
| 2 | 1 の影響 | `AzureDiagnostics` は「Azure 診断」モードで送る全リソースの共用テーブル。今このワークスペースに送っているのは VPN ゲートウェイだけ（Container Apps はリソース固有のテーブル）なので、**今は `AzureDiagnostics` の保持期間 = VPN ログの保持期間**になる。今後ほかのリソースを Azure 診断モードで送ると、同じ保持期間になる | — |
| 3 | Google Cloud VPN のログ | 自動で Cloud Logging に出る（`resource.type="vpn_gateway"`）。保持は30日（`_Default`）で、長く残すには振り分けが必要。BGP のログは Cloud Router（`resource.type="gce_router"`） | [Cloud VPN: View logs and metrics](https://docs.cloud.google.com/network-connectivity/docs/vpn/how-to/viewing-logs-metrics)、[Cloud Router: View logs and metrics](https://docs.cloud.google.com/network-connectivity/docs/router/how-to/viewing-logs-metrics) |
| 4 | Google でログを OFF にする方法 | 出力自体は止められないが、**`_Default` シンクの除外**で保存しないようにできる（プロジェクトの除外 API は `_Default` シンクに除外を作る）。`_Required` は除外できない | [projects.exclusions](https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/projects.exclusions) |
| 5 | Google のログバケット | 保持は 1〜3650日（`_Default` も変更可）。30日を超える分は課金。削除すると7日間 `DELETE_REQUESTED` で同じ名前を作れない。リージョンは作成後変更不可 | [Configure log buckets](https://docs.cloud.google.com/logging/docs/buckets) |

## 5. ログのアーカイブ（`features.logArchive`）

### 5.1 AWS（S3 へ退避。方式を設定で選ぶ）

```ts
// config/aws/monitoring.ts（新規。抜粋）
export const awsLogArchiveConfig = {
  /** Delete the archive (and its contents) on destroy (§5.4) */
  deleteOnDestroy: true,
  /** "firehose": continuous delivery / "export": scheduled export task */
  mode: "firehose" as "firehose" | "export",
  bucket: {
    name: "<globally-unique-name>", // required (§8 #4)
    lifecycle: { transitionToGlacierDays: 30, expireDays: 365 },
  },
  /** Log groups to archive. Names must match cloudwatchlogs.ts */
  logGroups: ["/aws/ecs/api-service", "/aws/ecs/worker-service"],
  firehose: { bufferingSizeMb: 5, bufferingIntervalSeconds: 300 },
  export: { scheduleExpression: "cron(0 2 * * ? *)", timezone: "Asia/Tokyo" },
};
```

| | `firehose`（常時転送） | `export`（定期エクスポート） |
|---|---|---|
| 仕組み | ロググループのサブスクリプションフィルター → Firehose → S3 | EventBridge Scheduler → Lambda → `CreateExportTask` → S3 |
| 作るリソース | S3 バケット（+ ライフサイクル）、Firehose 配信ストリーム（**ロググループごとに1本**。S3 のプレフィックスをロググループ別にするため）、サブスクリプションフィルター、IAM ロール 2つ（CloudWatch Logs → Firehose、Firehose → S3） | S3 バケット（+ ライフサイクル・バケットポリシー）、Lambda（コードはリポジトリ内。`TerraformAsset` で zip 化するため依存関係の追加なし）、スケジュール、IAM ロール 2つ（Lambda 用、Scheduler 用） |
| 遅延 | 数分（バッファ設定しだい） | 日次など。ログが出力可能になるまで最大12時間かかるため、前日分を対象にする |
| 注意点 | ロググループごとのサブスクリプションフィルターは最大2つ。S3 に入るデータは gzip 圧縮された CloudWatch Logs 形式（解凍処理は任意。§8 #7） | エクスポートタスクはアカウントで同時に1つまで。Lambda で順番に実行する（ロググループが多いと Lambda の最大15分に収まらない可能性） |
| コスト | Firehose の取り込み量に応じた従量課金 + S3 | Lambda・Scheduler はごく小さい + S3 |

- `logGroups` の名前が `cloudwatchlogs.ts` にない場合は、合成時にエラーにする（既存の `getLogGroup` と同じ）。
- IAM ロールはアーカイブ専用のため、`iam.ts` ではなくアーカイブの処理の中で作る（§8 #3）。
- 実装（2026-10-10）: `constructs/observability/awslogarchive.ts`（`createAwsLogArchive`）、`clouds/aws/logarchive.ts`。S3 はパブリックアクセスをすべてブロック。Firehose のロールの信頼ポリシーは `sts:ExternalId`（アカウント ID）、CloudWatch Logs のロールは `aws:SourceArn` で制限。`export` の Lambda は Python 3.12（`assets/lambda/cwl-export/index.py`、`.gitignore` が `*.js` を除外しているため Python）、自身のロググループを事前に作成（`lambdaLogRetentionDays`）。

### 5.2 Google Cloud（Logging Sink で GCS へ）

```ts
// config/google/monitoring.ts（新規。抜粋）
export const googleLogArchiveConfig = {
  /** Delete the archive (and its contents) on destroy (§5.4) */
  deleteOnDestroy: true,
  bucket: {
    name: "<globally-unique-name>", // required (§8 #4)
    location: LOCATION,
    lifecycle: { toArchiveClassDays: 30, deleteDays: 365 },
  },
  sinks: [
    // filter omitted -> built from the Cloud Run service names
    { name: undefined, cloudRunServices: ["web-service-with-lb", "web-service-standalone"] },
  ],
};
```

- 作るリソース: GCS バケット（均一なバケットレベルのアクセス、ライフサイクル）、`google_logging_project_sink`（`unique_writer_identity = true`）、シンクの書き込み用サービスアカウントへの `roles/storage.objectCreator` 付与。
- フィルターは `resource.type="cloud_run_revision" AND resource.labels.service_name=(...)` を処理側で組み立てる。`filter` を直接書くこともできるようにする。
- GCS へは1時間ごとにまとめて書き込まれる。アーカイブ用のシンクは段階4のログバケット・`_Default` 除外とは独立しているため、`logs: false` のサービスもアーカイブされる。
- 実装（2026-10-10）: シンクは1つ（対象サービスの OR 条件）。`cloudRunServices` 省略時は作成するすべてのサービス。対象がない場合は何も作らない（空のフィルターは全ログに一致するため）。

### 5.3 Azure（診断設定でストレージアカウントへ）

```ts
// config/azure/azuremonitor.ts（追加。抜粋）
logArchive: {
  /** Delete the archive (and its contents) on destroy (§5.4) */
  deleteOnDestroy: true,
  storageAccount: {
    name: "<globallyuniquename>", // required. 3-24 lowercase alphanumerics (§8 #4)
    replication: "LRS",
    lifecycle: { toCoolDays: 30, toArchiveDays: 90, deleteDays: 365 },
  },
  /** Environments to archive. Omitted -> every environment with logs: true (§4.3) */
  acaEnvironments: undefined,
},
```

- 作るリソース: ストレージアカウント、ライフサイクル（`azurerm_storage_management_policy`）。§4.3 の診断設定の送信先にストレージアカウントを加える。
- ストレージには `insights-logs-containerappconsolelogs` などのコンテナに、1時間ごとのファイルとして保存される。
- 既存・新規の環境にかかわらず、`acaEnvironments` を省略すれば `logs: true` のすべての環境が対象になる。
- `logs` が false の環境を `acaEnvironments` に書いた場合は、合成時にエラーにする。
- 実装（2026-10-10）: ストレージアカウントは Container Apps より先に作り（`clouds/azure/logarchive.ts`）、環境の診断設定に `storage_account_id` を加える。

### 5.4 destroy 時のアーカイブ

- 既定では**アーカイブも一緒に削除する**（スタックごと destroy できるようにする）。
- 各クラウドの `logArchive.deleteOnDestroy` で切り替えられるようにする。

| `deleteOnDestroy` | AWS（S3） | Google（GCS） | Azure（ストレージアカウント） |
|---|---|---|---|
| true（既定） | `force_destroy = true`（中身ごと削除） | `force_destroy = true` | 通常どおり削除（中身ごと消える） |
| false | `force_destroy = false` | `force_destroy = false` | `lifecycle.prevent_destroy = true` |

- false のとき: Terraform には「そのリソースだけ残して destroy を成功させる」仕組みがないため、**中身がある間（Azure は常に）destroy がエラーで止まる**。残したい場合は、destroy の前に state から外す（`terraform state rm` 相当）などの手作業が必要になる。この点は設定ファイルのコメントと運用文書に書く。

## 6. アラート（`features.alerting`）

### 6.1 共通の形

クラウドをまたいだ共通の抽象化（「CPU 80% 超で通知」を全クラウドに一括設定、など）は**しない**。
メトリクス名・単位・集計方法がクラウドごとに違うため。代わりに**設定の形だけをそろえる**。

- **通知先**（`notificationTargets`）: `key` で識別し、アラームからは `notify: ["<key>"]` で参照する。
- **アラーム**（`alarms`）: クラウド固有のメトリクス名で書く。対象リソースは ARN や ID ではなく**設定上の名前**で書き、処理側で解決する。
- 名前は NAM-02 のルールに従う（設定ファイルで指定、省略時は既定名）。
- 既定のアラームは空（設定に書いたものだけ作る）。設定ファイルにコメントで例を用意する。

```ts
// config/aws/monitoring.ts（例）
export const awsAlertingConfig = {
  notificationTargets: [
    { key: "ops", name: undefined, emails: ["ops@example.com"] },
  ],
  metricFilters: [],
  alarms: [
    {
      name: "ecs-api-cpu-high",
      namespace: "AWS/ECS", metricName: "CPUUtilization",
      dimensions: { ClusterName: "main-cluster", ServiceName: "api-service" },
      statistic: "Average", threshold: 80, comparison: "GreaterThanThreshold",
      periodSeconds: 300, evaluationPeriods: 2,
      notify: ["ops"],
    },
  ],
};
```

### 6.2 クラウドごとの対応

| | AWS | Google Cloud | Azure |
|---|---|---|---|
| 通知先 | SNS トピック + メール購読（**新規 construct** `createAwsSnsTopics`） | 通知チャネル（既存 construct） | アクショングループ（既存 construct） |
| アラーム | CloudWatch メトリクスアラーム（既存 construct に `dimensions` を追加） | アラートポリシー（既存 construct の集計方法を設定可能に。既定は今の `ALIGN_RATE`） | メトリクスアラート（既存 construct）/ ログアラート（**新 API `azurerm_monitor_scheduled_query_rules_alert_v2` に変更**。§6.4） |
| 対象の指定 | `dimensions` に ECS のクラスタ名・サービス名をそのまま書く | フィルターに `resource.labels.service_name` を書く | `target: { type: "containerApp", name: "<アプリ名>" }` を ID に解決 |
| 設定の場所 | `config/aws/monitoring.ts`（新規。`cloudwatchlogs.ts` の空のメトリクスフィルター・アラーム設定を移す） | `config/google/monitoring.ts`（新規） | `config/azure/azuremonitor.ts`（既存。アクショングループはここに残す） |
| 処理の場所 | `clouds/aws/monitoring.ts`（新規） | `clouds/google/monitoring.ts`（新規） | `clouds/azure/monitoring.ts`（新規。`index.ts` から移す） |

- 通知先の種類は設定ファイルで選べる形にする。最初に実装するのはメールのみで、Slack は後から追加できる形にしておく（§6.3）。
- AWS のメール購読は、受信者が確認メールで承認するまで有効にならない（Terraform では承認できない）。
- アラートの処理はコンテナなどのリソースを作った後に実行する（Azure で対象の ID が必要なため）。
- class 型の既存 construct（`constructs/observability/*`）は class のまま、項目の追加だけ行う（AGENTS.md §9.1。Terraform のアドレスを変えないため）。

### 6.3 通知先の Slack 対応（将来）

通知先の設定は、種類ごとの項目を並べる形にする。今回は `emails` だけを実装し、`slack` は形だけ決めておく（書いた場合は「未対応」として合成時にエラーにする）。

```ts
notificationTargets: [
  {
    key: "ops",
    emails: ["ops@example.com"],
    // Future: slack: { ... }  (cloud-specific fields, see below)
  },
],
```

Slack への通知の仕組みはクラウドごとに大きく違う。

| | 方式 | 事前の手作業 | 設定に書くもの |
|---|---|---|---|
| AWS | AWS Chatbot（`aws_chatbot_slack_channel_configuration`）を SNS トピックに紐付ける | コンソールで Slack ワークスペースを一度承認する（Terraform ではできない） | ワークスペース ID、チャンネル ID（+ Chatbot 用 IAM ロール） |
| Google | 通知チャネルの種類 `slack` | Slack アプリの認証トークンを取得する | チャンネル名。トークンは秘密情報のため `.env` から読む（AGENTS.md §18） |
| Azure | アクショングループに直接の Slack 連携はない。Webhook 受信者に Slack の Incoming Webhook を指定しても、送られる形式（共通アラートスキーマ）を Slack が受け付けない | 変換用の Logic App または Function が必要 | Webhook URL（秘密情報。`.env`）。変換の仕組みは別途設計 |

- Slack 対応は、この3つの違いを踏まえて別途設計・実装する（今回の段階には含めない）。

### 6.4 Azure のログアラート（新 API）

- 既存 construct のログアラートを、旧 API（`azurerm_monitor_scheduled_query_rules_alert`）から**新 API（`azurerm_monitor_scheduled_query_rules_alert_v2`）に置き換える**。
- 今はログアラートの設定がなくリソースが1つもないため、置き換えても既存のリソースには影響しない。
- 定義の項目は新 API に合わせて変える（construct の設定の形の変更）:

| 項目 | 旧 | 新 |
|---|---|---|
| 対象 | `dataSourceId` | `scopes`（Log Analytics ワークスペース。既定で `azureMonitorConfig` のワークスペース） |
| 間隔 | `frequencyInMinutes` / `timeWindowInMinutes`（分） | `evaluationFrequency` / `windowDuration`（`PT5M` などの ISO 8601 形式） |
| 条件 | `operator` / `threshold` | `criteria`（`query`、`timeAggregationMethod`、`operator`、`threshold`、`failingPeriods` など） |
| 重要度 | なし | `severity`（0〜4） |
| 通知 | `actionGroups` | `actionGroups`（同じく `notificationTargets` の `key` で参照） |

- `logs_destination = "azure-monitor"`（§4.3）のとき、Container Apps のログは `ContainerAppConsoleLogs` / `ContainerAppSystemLogs` テーブルに入る。ログアラートのクエリはこのテーブルを対象に書く。

## 7. オートスケーリング

各クラウドの標準の仕組み（ターゲット追跡・プラットフォームの自動スケーリング）を使う。設定は各ワークロードの設定ファイルに置く。

| ワークロード | 方針 | 変更内容 |
|---|---|---|
| ECS | 現状の CPU / メモリのターゲット追跡を維持し、ALB のターゲットあたりリクエスト数を指標に追加できるようにする | `ecs.ts` の `autoScaling` に項目追加、`awsecs.ts` に対応 |
| Cloud Run | インスタンスあたりの最大同時リクエスト数を設定できるようにする（任意のメトリクスは不可）。**CPU の目標使用率は Terraform プロバイダ（google 7.46）で設定できないため対象外**（Cloud Run が自動で調整） | `cloudrun.ts` に `maxInstanceRequestConcurrency`、`googlecloudrun.ts` に対応 |
| Container Apps | 最小 / 最大レプリカを設定ファイルに出し、スケールルール（HTTP 同時リクエスト、CPU、メモリ）を設定できるようにする | `containerapps.ts` に `minReplicas` / `maxReplicas` / `scaleRules` を追加、`azureaca.ts` に対応 |
| VM | 対象外（§8 #1） | — |

- アラーム連動のステップスケーリングは後回しにする（ターゲット追跡で開始）。
- 項目を省略したときは今の値になるようにする（Container Apps: 0〜10、Cloud Run: 今の設定値）。

出典:
[Cloud Run instance autoscaling](https://docs.cloud.google.com/run/docs/about-instance-autoscaling)、
[Cloud Run scaling controls](https://docs.cloud.google.com/run/docs/configuring/scaling-controls)、
[Container Apps scale rules](https://learn.microsoft.com/azure/container-apps/scale-app)

## 8. 判断事項

| # | 項目 | 決定 | 状態 |
|---|---|---|---|
| 1 | VM のオートスケーリング | 対象外（単体 VM のまま。必要になった時点で別途設計） | 決定（2026-10-10。推奨案を採用） |
| 2 | 通知先の種類 | 今回はメールのみ実装。**将来 Slack を扱えるよう設定の形を決めておく**（§6.3） | 決定（2026-10-10） |
| 3 | AWS アーカイブ用 IAM ロールの置き場所 | アーカイブの処理の中で作る（`logArchive` が OFF なら作られない）。名前は `monitoring.ts` で指定 | 決定（2026-10-10。推奨案を採用） |
| 4 | バケット・ストレージアカウントの名前 | 指定を必須にする（グローバルに一意のため） | 決定（2026-10-10。推奨案を採用） |
| 5 | destroy 時のアーカイブ | **既定は削除**。`logArchive.deleteOnDestroy` で切り替え可能に（§5.4） | 決定（2026-10-10） |
| 6 | `ecs.ts` の未使用項目 `logRetentionInDays` | 削除 | 決定（2026-10-10。推奨案を採用） |
| 7 | Firehose で S3 に入るデータの形式 | そのまま（gzip の CloudWatch Logs 形式）。必要になったら解凍を設定で選べるようにする | 決定（2026-10-10。推奨案を採用） |
| 8 | Azure のログアラート | **新 API（`azurerm_monitor_scheduled_query_rules_alert_v2`）を使う**（§6.4） | 決定（2026-10-10） |
| 9 | Container Apps のログ | **既定で ON。既存・新規の環境にかかわらず適用し、環境ごとに上書き可能**（§4.3） | 決定（2026-10-10）。既存環境が作り直しにならないかは実装時に `cdktn diff` で確認 |
| 10 | Log Analytics ワークスペース | **1つのワークスペース（`azureMonitorConfig.logAnalyticsWorkspace`）に集約**（VPN・Container Apps・ログアラートで共用）。AWS の「CloudWatch Logs の中にリソースごとのロググループ」に相当 | 決定（2026-10-10） |
| 11 | ログの保持期間 | **段階4に含める**。AWS: ロググループごと、Google: **用途ごとのログバケット（VPN・Cloud Run）を作り、バケットごとに設定**、Azure: テーブルごと（§4） | 決定（2026-10-10） |
| 12 | VPN のログの ON/OFF | **全クラウドで各リソースの `logs` で制御**（Google は `_Default` からの除外、§4.2） | 決定（2026-10-10） |
| 13 | Google のログバケットを destroy 後7日以内に作り直せない問題 | (a) 運用文書に注意を書く / (b) バケット ID を設定で変えられるようにしておき、すぐ作り直すときは ID を変える / (c) destroy 時にバケットを残す（`_Default` のように Terraform の管理から外す） | 決定（2026-10-10）: (a)+(b) |
| 14 | Azure VPN ログの保持期間 | `AzureDiagnostics` テーブルの保持期間で設定する（§4.4 #1・#2。VPN 専用のテーブルはない） | 決定（2026-10-10） |
| 15 | Google のログバケットの既定値 | ベストプラクティスに合わせる（§4.2）: 場所は `LOCATION`、保持 30日、`enableAnalytics` は設定項目（既定 false）、バケットは `vpn` / `cloudrun` | 決定（2026-10-10） |

## 9. 進め方（段階）

| 段階 | 内容 | 合成結果 |
|---|---|---|
| 1 | `features.alerting` / `features.logArchive` を追加。Azure Monitor の `useVpn` 依存を解消し、アクショングループを `alerting` で作る形に | 変化なし（既定値で再現）。**完了（2026-10-10）** |
| 2 | 監視の処理を `clouds/<cloud>/monitoring.ts` に分離（AWS のメトリクスフィルター・アラーム設定、Azure の `index.ts` の処理を移動） | 変化なし。**完了（2026-10-10）** |
| 3 | アラート: AWS の SNS construct とアラームの `dimensions`、Google の結線と集計方法の設定化、Azure のログアラートの新 API 化とアラート対象の名前解決 | 設定を書いた分だけ追加。**完了（2026-10-10）**。設定: `config/aws/monitoring.ts`（`awsAlertingConfig`）、`config/google/monitoring.ts`（`googleAlertingConfig`）、`config/azure/azuremonitor.ts`（`actionGroups[].key`、`azureAlertingConfig`） |
| 4 | ログ取得: 各リソースの `logs`（AWS VPN・Azure VPN・Container Apps・Google VPN / Cloud Run）、Google の用途ごとのログバケット、Azure のテーブルごとの保持期間（§4） | Container Apps の既存2環境の設定が変わる。Google はバケット・シンク・除外が追加される（Google VPN / Cloud Run の既定は `logs: true`）。**完了（2026-10-10）**。あわせて AWS VPN の `logOutputFormat`、ECS の `awsEcsClusterSettings.containerInsights` / `logMode` / `logMaxBufferSize` を設定化（既定は従来どおり） |
| 5 | ログのアーカイブ: Google → Azure → AWS（`firehose` → `export`）の順 | `logArchive` が ON のときだけ追加。**完了（2026-10-10）** |
| 6 | オートスケーリングの設定拡張（ECS / Cloud Run / Container Apps） | 設定を書いた分だけ変化。**完了（2026-10-10）**。ECS: `autoScaling.requestCountPerTarget`（ローリングデプロイのみ。ブルー/グリーンは2つのターゲットグループを切り替えるためエラー）。Cloud Run: `maxInstanceRequestConcurrency`。Container Apps: `minReplicas` / `maxReplicas` を設定ファイルに明示（従来の既定値 0 / 10）、`scaleRules`（http / tcp / cpu / memory） |

- 各段階で、型チェックと回帰テスト（`__tests__/synth-matrix.test.ts`）を実行する。`alerting` / `logArchive` の ON/OFF の組み合わせを合成マトリクス（`scripts/dev/synthMatrix.ts`）に加える。
- 段階1・2 は合成結果が変わらないことを全パターンで確認する。

## 10. 影響・リスク

- 段階1〜3・5・6 は、フラグと設定を書かなければリソースは増えない。
- 段階4 は既存の Container Apps 環境の設定を変える（作り直しになるかは要確認）。
- `deleteOnDestroy: true`（既定）では、destroy でアーカイブも消える。残したいときは false にする（§5.4。destroy が止まる点に注意）。
- Slack 対応（§6.3）は今回の段階に含めない。AWS はコンソールでの事前承認、Google・Azure は秘密情報（トークン・Webhook URL）の扱いが必要になる。
- コスト: CloudWatch アラーム・Google のメトリクスはアラーム数に応じた課金、Firehose は取り込み量、各ストレージは保存量に応じた課金。ライフサイクルでアーカイブ用のストレージクラスへ移して抑える。
- 依存関係の追加はない（必要なリソースは既存のプロバイダに含まれる。Lambda の zip 化は cdktn の `TerraformAsset` を使う）。
- 影響するファイル（予定）:
  - 設定: `config/commonsettings.ts`、`config/aws/{monitoring.ts（新規）, cloudwatchlogs.ts, ecs.ts, awssettings.ts}`、`config/google/{monitoring.ts（新規）, cloudrun.ts, googlesettings.ts}`、`config/azure/{azuremonitor.ts, containerapps.ts}`
  - 処理: `clouds/{aws,google,azure}/monitoring.ts`（新規）、`clouds/{aws,google,azure}/index.ts`、`clouds/{aws,google,azure}/types.ts`、`clouds/azure/container.ts`
  - construct: `constructs/observability/*`（項目追加）、新規（SNS、S3 / GCS / Azure Storage のアーカイブ、Firehose、エクスポート用 Lambda）、`constructs/container/*`
  - テスト・文書: `__tests__/`、`scripts/dev/synthMatrix.ts`、`docs/architecture.md`、`docs/getting-started.md`、`README.md`
