# FEAT-03 監視・オートスケーリング 設計方針

- 作成日: 2026-10-04
- ステータス: **設計方針の案（ユーザー判断待ち。§6）**
- 関連: `docs/ai/vpn_refactor_plan.md` の FEAT-03

## 1. 目的

1. AWS / Azure / Google Cloud の監視（アラーム・通知）を、設定ファイルから制御できるようにする。
2. 監視（メトリクス）に沿ってオートスケーリングできるようにする。
3. 機能フラグや名前の設定など、これまでの再構成で決めたルールに従う
   （機能は VPN に依存させない、名前は設定ファイルから、など）。

## 2. 現状

| 項目 | AWS | Azure | Google Cloud |
|---|---|---|---|
| 監視の construct | `AwsCloudWatchResources`: ロググループ、メトリクスフィルター、アラーム | `AzureMonitorResources`: Log Analytics、アクショングループ、ログアラート、メトリクスアラート | `GcpMonitoringResources`: ログメトリクス、通知チャネル、アラートポリシー |
| 使われ方 | ロググループのみ作成。メトリクスフィルター・アラームの設定は空 | `useVpn` が ON のときだけ作成（VPN 非依存の方針と矛盾） | **未使用**（どこからも呼ばれていない） |
| 通知先 | 通知先（SNS トピック）を作る仕組みがない。アラームには ARN を直接書く | アクショングループ（メール等） | 通知チャネル |
| コンテナのスケーリング | ECS: CPU / メモリのターゲット追跡（実装済み） | Container Apps: 最小 / 最大レプリカのみ。スケールルールなし | Cloud Run: 最小 / 最大インスタンスのみ |
| VM のスケーリング | なし（EC2 単体） | なし（VM 単体） | なし（GCE 単体） |

### 各クラウドのスケーリングの仕組み（調査結果）

| サービス | スケールの指標 | 設定できるもの |
|---|---|---|
| ECS（Application Auto Scaling） | ターゲット追跡（CPU、メモリ、ALB のターゲットあたりリクエスト数）、ステップスケーリング（CloudWatch アラーム連動） | 目標値、最小 / 最大タスク数、クールダウン |
| Cloud Run | CPU 使用率と同時リクエスト数のみ（任意のメトリクスは不可） | 目標使用率（既定 60%、10〜95%）、最小 / 最大インスタンス、インスタンスあたり最大同時リクエスト数 |
| Container Apps | HTTP 同時リクエスト、TCP 接続数、カスタム（CPU、メモリ、Service Bus 等の KEDA スケーラー） | `http_scale_rule` / `tcp_scale_rule` / `custom_scale_rule`、最小 / 最大レプリカ |
| VM | スケールグループが必要（AWS Auto Scaling Group / Google MIG + Autoscaler / Azure VMSS + Autoscale 設定） | 現状は単体の VM なので、使うには構成変更が必要 |

出典:
[Cloud Run instance autoscaling](https://docs.cloud.google.com/run/docs/about-instance-autoscaling)、
[Cloud Run scaling controls](https://docs.cloud.google.com/run/docs/configuring/scaling-controls)、
[Container Apps scale rules](https://learn.microsoft.com/azure/container-apps/scale-app)

## 3. 方針

### 3.1 有効化

- `clouds.<cloud>.features.monitoring` を追加する。監視（通知先・アラーム・Log Analytics 等）はこのフラグで作る。
- Azure Monitor の `useVpn` 依存をなくす。VPN ゲートウェイの診断設定は、Log Analytics があれば付ける（今と同じ）。
- **オートスケーリングの設定は、各ワークロードの設定ファイルに置く**（`ecs.ts`、`cloudrun.ts`、`containerapps.ts`）。
  スケーリングはワークロードの性質なので、監視の設定とは分ける（ECS の `autoScaling` と同じ形）。
- 既定値は今の動きを再現する（今 Azure Monitor が作られている設定では、`monitoring: true` にする）。

### 3.2 監視：クラウドごとの「通知先」と「アラーム」

クラウドをまたいだ共通の抽象化（「CPU 80% 超で通知」をすべてのクラウドに一括設定、など）は**しない**。
メトリクス名・単位・集計方法がクラウドごとに違い、無理にそろえると設定が分かりにくくなるため
（プラン §1 の「過剰な抽象化はしない」）。

代わりに、**設定の形だけをそろえる**:

```ts
// config/<cloud>/monitoring.ts（例: AWS）
export const awsMonitoringConfig = {
  // 通知先（AWS: SNS トピック + サブスクリプション）
  notificationTargets: [
    { key: "ops", name: "multicloud-ops-alerts", emails: ["ops@example.com"] },
  ],
  // アラーム（クラウド固有のメトリクス名で書く）。notify は notificationTargets の key
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

| | AWS | Azure | Google Cloud |
|---|---|---|---|
| 通知先 | SNS トピック + メール購読（**新規 construct**） | アクショングループ（既存） | 通知チャネル（既存） |
| アラーム | CloudWatch メトリクスアラーム（既存） | メトリクスアラート / ログアラート（既存） | アラートポリシー（既存） |
| 置き場所 | `config/aws/monitoring.ts`（`cloudwatchlogs.ts` のアラーム設定を移す） | `config/azure/azuremonitor.ts`（既存を利用） | `config/google/monitoring.ts`（新規） |
| 処理 | `clouds/aws/monitoring.ts`（新規） | `clouds/azure/monitoring.ts`（`index.ts` から移す） | `clouds/google/monitoring.ts`（新規。未使用の construct を結線） |

- アラームの対象リソースは、ARN や ID ではなく**設定上の名前**（ECS サービス名、DB 識別子など）で書けるようにし、処理側で解決する（既存の `getIamRoleArn` 等と同じ考え方）。
- 名前は NAM-02 のルールに従う（設定ファイルで指定、省略時は既定名）。

### 3.3 オートスケーリング

各クラウドの**標準の仕組み（ターゲット追跡・プラットフォームの自動スケーリング）を使う**。
アラームと連動するステップスケーリングは、ターゲット追跡で足りない場合の追加機能として後回しにする。

| ワークロード | 方針 | 変更内容 |
|---|---|---|
| ECS | 現状のターゲット追跡（CPU / メモリ）を維持し、ALB のターゲットあたりリクエスト数を指標として追加できるようにする | `ecs.ts` の `autoScaling` に項目追加、`awsecs.ts` に対応 |
| Cloud Run | CPU 目標使用率・同時リクエスト数・最小 / 最大インスタンスを設定できるようにする（任意メトリクスは不可） | `cloudrun.ts` に項目追加、`googlecloudrun.ts` に対応 |
| Container Apps | スケールルール（HTTP 同時リクエスト、CPU、メモリ）を設定できるようにする | `containerapps.ts` に `scaleRules` 追加、`azureaca.ts` に対応 |
| VM | **要判断（§6）** | — |

## 4. 進め方（段階）

| 段階 | 内容 | 合成結果 |
|---|---|---|
| 1 | `features.monitoring` を追加し、Azure Monitor の `useVpn` 依存を解消 | 今の設定では変化なし（既定値で再現） |
| 2 | 監視処理を `clouds/<cloud>/monitoring.ts` に分離（AWS のアラーム設定、Azure の `index.ts` の処理を移動） | 変化なし |
| 3 | AWS の通知先（SNS）construct を追加し、アラームから設定上の名前で参照できるようにする | 設定を書いた分だけリソース追加 |
| 4 | Google の監視を結線（`clouds/google/monitoring.ts`） | 設定を書いた分だけリソース追加 |
| 5 | コンテナのスケーリング設定を拡張（ECS / Cloud Run / Container Apps） | 設定を書いた分だけ変化 |
| 6 | （§6 の判断しだい）VM のスケールグループ化 | 構成変更 |

各段階で、回帰テスト（`__tests__/synth-matrix.test.ts`）に監視・スケーリングの確認を追加する。

## 5. 影響・リスク

- 段階 3〜5 は、設定を書かなければリソースは増えない（既定は空）。
- SNS・アクショングループ・通知チャネル自体のコストはごく小さいが、アラーム数に応じて課金がある（特に AWS CloudWatch アラーム、Google のメトリクス）。
- VM のスケールグループ化は、既存の VM を作り直すことになる（§6）。

## 6. 決めていただきたいこと

| # | 項目 | 選択肢 | 推奨 |
|---|---|---|---|
| 1 | VM のオートスケーリング | (a) 対象外（単体 VM のまま。監視のアラームのみ） / (b) スケールグループ化（AWS ASG / Google MIG / Azure VMSS）。既存 VM は作り直しになり、構成とコストが変わる | (a)。必要になった時点で (b) を別途設計 |
| 2 | 通知先の種類 | メールのみ / メール + その他（Slack 等の Webhook、SMS） | まずメールのみ |
| 3 | 既定のアラーム | (a) 空（設定に書いたものだけ） / (b) よく使うもの（VM・DB の CPU 高、LB の 5xx 増加など）を既定で用意し、設定で ON/OFF | (a)。サンプルとして設定例をコメントで用意 |
| 4 | ステップスケーリング（アラーム連動） | 今回の範囲に含める / 後回し | 後回し（ターゲット追跡で開始） |
| 5 | 進め方 | 段階 1〜5 を順に / 監視（1〜4）とスケーリング（5）を分けて判断 | 段階 1・2（構造の準備、合成結果不変）から着手 |
