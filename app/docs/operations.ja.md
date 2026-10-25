# 運用

[English](operations.md)

deploy / destroy の手順と既知の問題です。コマンドはすべて、その環境の `cdktn-backend` コンテナの中で、`/app` から実行します（getting-started.ja.md の「環境」を参照）。

## 環境

各コンテナは 1 つの環境（コンテナの起動時に指定した `DEPLOY_ENV`）を扱います。その環境の認証情報（`.env.<環境名>`）、設定（`config/` の `byEnv`）、state（`state/<環境名>/terraform.tfstate`）を使います。

```bash
# ホストで
DEPLOY_ENV=stg docker compose -p cdktn-stg up -d
docker compose -p cdktn-stg exec cdktn-backend bash
# コンテナの中で
echo "$DEPLOY_ENV"   # diff / deploy / destroy の前に環境を確認する
```

同時に操作する環境は 1 つだけにしてください。コンテナは `app/` とその `cdktf.out/` を共有しています。

### 既存の deploy の state を移す

環境の仕組みを入れる前の deploy は、state を `terraform.app.tfstate` に保存しています。その deploy をどの環境として引き継ぐかを決め、その環境の設定で変更が出ないことを確認してから、ファイルを移します（コンテナの中で、何も実行していないときに行います）。

```bash
ENV=dev
mkdir -p "state/$ENV"
mv terraform.app.tfstate "state/$ENV/terraform.tfstate"
[ -f terraform.app.tfstate.backup ] && mv terraform.app.tfstate.backup "state/$ENV/terraform.tfstate.backup"
cdktn diff   # その環境のコンテナで: 変更がないことを確認する
```

あわせて、認証情報（リポジトリ直下の `.env`）と秘密の値（`config/.env`）を `.env.<環境名>`（テンプレート: `.env.ENV.sample`）に移し、`.env` にはツールのバージョンだけを残します。

## 環境を構築する

初回のデプロイ（または destroy の後のデプロイ）です。インフラの手順に、アプリのリポジトリの手順が間に入ります
（そのリポジトリの getting-started の「全体の流れ」）。

`cdktn deploy` は 3 回実行します。2 つの設定は、cdktn の外の作業が終わってからでないと有効にできないためです。
環境の**構築の段階**がそれらを決めます（`config/buildstage.ts`）。cdktn のコンテナで `npm run build-stage -- <段階>` で
設定し、`npm run build-stage` で表示します。段階は Terraform の state と同じ `state/<環境名>/build-stage.json` に
記録されます（Git の管理外）。ファイルがなければ段階 1 です。

| 段階 | deploy | API コンテナの設定（`config/apicontainer.ts`） | 先に有効にできない理由 |
|---|---|---|---|
| 1 | 1 回目（手順 3） | `azureSecretReady`・`readinessProbe`・`journalPrune.enabled` を無効 | — |
| 2 | 2 回目（手順 5）、シークレットを入れた後 | `azureSecretReady` を有効 | Azure の Container App は Key Vault のシークレットがないと起動できず、シークレットは 1 回目で Key Vault ができた後にしか入れられない（VNet の中から。AWS と Google Cloud のダミーの値と違い、cdktn は作れない） |
| 3 | 3 回目（手順 8）、CI/CD がすべてのクラウドに API をデプロイした後 | 3 つとも有効 | 仮のイメージは `/` にしか応答しない（`/readyz` のヘルスチェックが失敗する）。変更履歴の削除ジョブも、最初から API のイメージで動くよう、ここで作る |

3 回目が本当に必要なのは `readinessProbe` だけです。削除ジョブは、もっと前に作ることもできます（AWS と Google Cloud は
1 回目から、Azure はジョブが Key Vault のシークレットを使うので 2 回目から）。その場合ジョブは仮のイメージで作られ、
CI/CD が API のイメージに切り替えます。ただ、API のデプロイより前にスケジュールの時刻が来ると失敗するため、
`readinessProbe` と一緒に作ります。

| # | 作業 | 場所 |
|---|---|---|
| 1 | 事前準備（一度だけ）：`.env.<環境名>`（Key Vault 用の自分のオブジェクト ID `AZURE_KEYVAULT_SECRETS_OFFICER_IDS` を含む）、クラウドの権限と API | [getting-started.ja.md](getting-started.ja.md) |
| 2 | `npm run build-stage` で段階 1 であることを確認（`npm run before-destroy` が 1 に戻す。そうでなければ `npm run build-stage -- 1`）。destroy の後は、まだ再利用できない名前も変える（下の「destroy の後にもう一度 deploy する」） | cdktn のコンテナ、設定ファイル |
| 3 | `cdktn diff` の後、`cdktn deploy`（下の「deploy」） | cdktn のコンテナ |
| 4 | すべてのクラウドにパスワードを入れる：`scripts/secrets-set.sh <cloud>`（アプリのリポジトリ。下の「シークレット」） | AWS と Google Cloud は Cloud Shell か VM、Azure は VM |
| 5 | `npm run build-stage -- 2` の後、`cdktn deploy` | cdktn のコンテナ |
| 6 | データベースのセットアップ（アプリのリポジトリの getting-started）：クラスタはどれか1台の VM で `scripts/cluster-setup.sh <cloud>`、クラウド単体は各クラウドの VM で `scripts/node-setup.sh <cloud>` | VM |
| 7 | API のデプロイ：インフラを構築した直後はマージする新しいコミットがなく、レジストリも空なので、各クラウドのパイプラインを 1 回実行する（アプリのリポジトリの getting-started の「デプロイ」）。パイプライン：`api-service-cicd`（`config/aws/cicd/cicdsettings.ts`）、`github-push-trigger`（`config/google/cicdsettings.ts`）、`multicloud-api-deploy`（`config/azure/cicd.ts`）。ビルドの結果はメールで届く（Azure DevOps は実行した人に、AWS と Google Cloud は `ALERT_EMAILS` に。下の「アラート」） | Cloud Shell、Azure DevOps |
| 8 | `npm run build-stage -- 3` の後、`cdktn deploy`：ロードバランサーとコンテナ基盤が `/readyz`・`/healthz` を使い、変更履歴の削除ジョブが作られる | cdktn のコンテナ |

構築の後の API のリリースでは `cdktn deploy` は不要です（環境のブランチへのマージだけ）。段階は 3 のままです。

## deploy

```bash
cdktn diff     # 必ず先に plan を確認する
cdktn deploy
```

## destroy

```bash
npm run before-destroy   # 親と一緒に削除されるものを state から外す
cdktn destroy
```

`before-destroy`（`scripts/before-destroy.sh`）は、Azure の PostgreSQL のサーバーのパラメータを Terraform の state から外します。パラメータの destroy はサーバーの値を戻す操作で、データベースに論理レプリケーションのスロットがあると失敗します（下の「Azure — PostgreSQL: サーバーのパラメータを戻せない」）。パラメータはサーバーと一緒に削除されます。クラウドには何も変更しません。

マネージドサービスの中には、リソースを非同期に解放するものがあります。そのため、依存関係の順序が正しくても、destroy がエラーで止まることがあります。下の既知の問題を確認し、指示があれば `cdktn destroy` をもう一度実行してください。

1 つのクラウドで待ちが必要なとき（下の Google Cloud のサブネットなど。1〜2 時間）、Terraform は最初のエラーで止まり、他のクラウドのリソースも残ります。他のクラウドを先に削除し、待つクラウドは後で `cdktn destroy` で削除します：

```bash
cd /app/cdktf.out/stacks/app
# Azure（AWS は aws_）。削除するものが計画に表示されるので、確認して yes
terraform destroy $(terraform state list | grep -E '^(azurerm_|azuredevops_)' | sed 's/^/-target=/')
```

それらに依存するもの（他のクラウドの Azure との VPN の接続など）も一緒に削除されます。Terraform は一部だけの destroy だという警告を出します。

### destroy の後にもう一度 deploy する

削除したリソースの名前は、しばらく再利用できないものがあります。また、削除したリソースに入れていた値は消えています。`cdktn deploy` の前に：

| # | 対象 | 理由・方法 |
|---|---|---|
| 1 | Google Cloud：Cloud SQL のインスタンスの `name` を変える（`config/google/cloudsql/cloudsql.ts`） | 削除したインスタンス名は約1週間再利用できません。末尾の日時を新しくします（例：`cloudsql-postgres-instance-2026-1018-1500`）。この名前を参照している設定は他にありません（API は deploy のときにインスタンスのアドレスを受け取り、プライベート DNS の名前 `aRecordName` は変わりません）。インスタンス名を指定するコマンド（`gcloud sql instances describe` など）は新しい名前で実行します |
| 2 | Google Cloud：ログのバケットの ID（`googleUseLogBuckets` が `true` のときだけ） | 削除したバケットの ID は 7 日間再利用できません（上の「ログ」）。dev は `false` のままにしています |
| 3 | Azure：Key Vault の名前（既にあるというエラーで deploy が失敗したときだけ） | provider は destroy のときに論理削除された Key Vault を完全に削除（purge）します。されなかった場合（purge の権限がないなど）は、`az keyvault purge --name <Key Vault の名前>` を実行します |
| 4 | 構築の段階を 1 にする：destroy の前の `npm run before-destroy` が 1 に戻す（`npm run build-stage` で確認） | 新しい Key Vault にはまだシークレットがなく（参照する Container App は起動できません）、CI/CD が API をデプロイするまでコンテナは仮のイメージで動くためです |

deploy の後は、初回と同じく、シークレットを入れ直し（下の「シークレット」。値はストアと一緒に削除されています）、データベースをセットアップし直し（アプリのリポジトリの getting-started の「データベースのセットアップ」）、API をデプロイし（上と同じくパイプラインを 1 回実行）、構築の段階を進めます（「環境を構築する」の手順 4〜8）。

## ログ

ログは、リソースごとに `logs` で ON/OFF を切り替えます。保存期間は、ログを保存する場所で設定します。

| クラウド | リソース | 切り替え | 保存先 | 保存期間 |
|---|---|---|---|---|
| AWS | VPN のトンネル | `customerGateways.<peer>.logs`（`config/aws/vpn.ts`） | ロググループ（`logGroupName`） | ロググループごと（`config/aws/cloudwatchlogs.ts`） |
| AWS | ECS | 常に ON | ロググループ（`cloudwatchLogGroupName`） | ロググループごと |
| Google Cloud | VPN ゲートウェイと Cloud Router | `logs` / `logBucket`（`config/google/vpn.ts`） | ログバケット（`config/google/cloudlogging.ts`） | ログバケットごと（`retentionDays`） |
| Google Cloud | Cloud Run | サービスごとの `logs` / `logBucket`（`config/google/cloudrun.ts`） | ログバケット | ログバケットごと |
| Azure | VPN ゲートウェイ | `logs`（`config/azure/vpn.ts`） | Log Analytics ワークスペースの `AzureDiagnostics` テーブル | テーブルごと（`azureMonitorConfig.tableRetention`） |
| Azure | Container Apps の環境 | `azureAcaEnvironmentDefaults` / `azureAcaEnvironmentSettings`（`config/azure/containerapps.ts`） | Log Analytics ワークスペースの `ContainerAppConsoleLogs` / `ContainerAppSystemLogs` | テーブルごと |

- Google Cloud: `logs: true` では、ログはログバケットに送られ、`_Default` バケットからは除外されます。そのため、保存（と課金）は 1 回だけです。`logs: false` では除外だけが行われます（保存されません）。
- Google Cloud: 削除したログバケットは 7 日間 `DELETE_REQUESTED` の状態になり、その ID は再利用できません。destroy から 7 日以内にもう一度 deploy するには、次のどれかを行います。
  - `config/google/cloudlogging.ts` で別の `bucketId` を指定する。
  - 7 日以内にバケットを復元する（`gcloud logging buckets undelete <バケット ID> --location=<ロケーション>`。失敗した deploy でバケットが tainted になっていれば、`terraform untaint` も行う）。
  - destroy と deploy を頻繁に繰り返す環境では、`googleUseLogBuckets` を `false` にする（`dev` は既定で `false`）。ログは `_Default` バケット（30 日）に残り、ログバケットは作られません。

  バケットのロケーションは作成後に変えられません。30 日を超える保存は課金されます。
- Azure: VPN ゲートウェイのログは、共有の `AzureDiagnostics` テーブルにしか送れません。そのため、このテーブルの保存期間は、「Azure 診断」モードでログを送るすべてのリソースに適用されます。`tableRetention` から項目を削除すると、そのテーブルはワークスペースの保存期間に戻ります。
- AWS: 既存の VPN トンネルの `logOutputFormat`（`text` / `json`）を変えると、各トンネルが数分間切断されます。ECS の Container Insights（`config/aws/ecs.ts` の `awsEcsClusterSettings`）と awslogs のモード（サービスごとの `logMode` / `logMaxBufferSize`）は、指定しなければアカウントの設定を使います。

## オートスケーリング

スケーリングは、ワークロードごとに設定ファイルで指定します。

| クラウド | 設定 | 内容 |
|---|---|---|
| AWS ECS | サービスごとの `autoScaling`（`config/aws/ecs.ts`） | `minCapacity` / `maxCapacity`、`cpuThreshold` / `memoryThreshold`（%）と `requestCountPerTarget`（タスクあたりの ALB のリクエスト数。ROLLING のデプロイで、ALB の `targetGroupName` がある場合のみ）によるターゲット追跡、クールダウン |
| Google Cloud Run | サービスごと（`config/google/cloudrun.ts`） | `minInstances` / `maxInstances`、`maxInstanceRequestConcurrency`（既定値 80）。Cloud Run は CPU 使用率と同時リクエスト数でスケールします。CPU の目標値は設定できません |
| Azure Container Apps | アプリごと（`config/azure/containerapps.ts`） | `minReplicas` / `maxReplicas`、`scaleRules`（`http` / `tcp`: 同時リクエスト数、`cpu` / `memory`: 使用率 %）。ルールがなければ HTTP で、レプリカあたり同時リクエスト 10。CPU / メモリのルールでは 0 までスケールインできません |

## ログのアーカイブ

`clouds.<cloud>.features.logArchive` を有効にすると、クラウドごとにコンテナのログをオブジェクトストレージに保管します。バケット / ストレージアカウントの名前は必須（全世界で一意）です。ライフサイクルのルールで、古いログを安いストレージに移し、削除します。

| クラウド | 設定 | 方法 | 対象のログ |
|---|---|---|---|
| AWS | `awsLogArchiveConfig`（`config/aws/monitoring.ts`） | `mode: "firehose"`: サブスクリプションフィルター → Firehose → S3（継続的、`<prefix>/YYYY/MM/DD/HH/`、gzip）。`mode: "export"`: EventBridge Scheduler → Lambda（`assets/lambda/cwl-export`）→ エクスポートタスク → S3（1 日 1 回、`<prefix>/YYYY/MM/DD/`） | `logGroups`（`cloudwatchlogs.ts` の名前） |
| Google Cloud | `googleLogArchiveConfig`（`config/google/monitoring.ts`） | ログシンク → Cloud Storage（1 時間ごとにまとめて） | Cloud Run のサービス（`cloudRunServices`。既定は作成したすべて）、または `filter` |
| Azure | `azureLogArchiveConfig`（`config/azure/azuremonitor.ts`） | Container Apps の環境の診断設定 → ストレージアカウント（`insights-logs-<カテゴリ>`、1 時間ごと） | `logs: true` の環境（`acaEnvironments`。既定はすべて） |

- `deleteOnDestroy: true`（既定）では、destroy のときにアーカイブを中身ごと削除します。`false` では、S3 / Cloud Storage は `force_destroy = false` のままになり、Azure のストレージアカウントには `prevent_destroy` が付きます。そのため destroy は失敗します（AWS / Google Cloud では、バケットが空でない間）。アーカイブを残す場合は、destroy の前に state から外してください。
- AWS の `export` モード: 毎回、終わってから 12 時間以上たった直近の UTC の 1 日分をエクスポートします（ログはエクスポートできるようになるまで最大 12 時間かかります）。エクスポートタスクはアカウントごとに 1 つずつしか動かず、Lambda は 15 分で止まります。ロググループの数を少なくするか、`firehose` を使ってください。
- AWS の `firehose` モード: 1 つのロググループに付けられるサブスクリプションフィルターは 2 つまでです。
- Azure: アーカイブのストレージアカウントは HTTPS（TLS 1.2 以上）だけを受け付け、Microsoft が管理するキーで保存時に暗号化されます。`infrastructureEncryption: true` で二重に暗号化します。これはアカウントの作成時にしか設定できません（変えるとアカウントが作り直され、アーカイブしたログは削除されます）。

## アラート

`config/commonsettings.ts` で `clouds.<cloud>.features.alerting` を有効にすると、クラウドごとにアラートを作ります。
通知先は `.env.<環境名>` の `ALERT_EMAILS`（カンマ区切り。公開リポジトリに入れないため。`config/notifications.ts`）の
アドレスで、各クラウドの通知先 `ops` がこれを使います。

### 監視している内容

| アラート | AWS | Google Cloud | Azure | 通知される条件 |
|---|---|---|---|---|
| `api-errors` | `/aws/ecs/api-service` のメトリクスフィルター（`"failed"`）とアラーム | Cloud Run のサービスのログベースの指標とアラートポリシー | `backend-api-service` の `ContainerAppConsoleLogs` のログアラート | API が 5 分以内にエラーをログに出した（例：DB に接続できない、マイグレーションが足りないときの `Readiness check failed: ...`、`Idle connection to ... failed`） |
| `journal-prune-failed` | 同じロググループ（ジョブは API のタスク定義で動く） | Cloud Run のジョブのログベースの指標 | Container Apps のジョブのログのアラート | 毎日の変更履歴の削除ジョブが失敗した（`Journal pruning failed: ...`） |
| `<ロードバランサー>-5xx` | ALB の `HTTPCode_ELB_5XX_Count` と `HTTPCode_Target_5XX_Count` | リージョンのロードバランサーの `request_count`（レスポンスコードのクラス 500） | Application Gateway の `ResponseStatus`（`HttpStatusGroup` が 5xx） | 5 分以内に 5xx が 10 回以上（ロードバランサーが返したもの〔正常な API がないなど〕、または API が返したもの） |
| ビルドの結果（`cicd` が有効なとき） | CodeBuild のプロジェクトの状態の変化（`SUCCEEDED`・`FAILED`・`STOPPED`）を EventBridge のルールで SNS のトピックへ（`buildNotifications`） | Cloud Build のログに一致するログ一致のアラートのポリシー：`cloud-build-succeeded`（`DONE`）、`cloud-build-failed`（`ERROR` で始まる行）。それぞれ最短 5 分に 1 通 | —（Azure DevOps がパイプラインを実行した人にメールする） | CI/CD のビルドが終わったとき |

ロードバランサーのアラートは、各クラウドの HTTP と HTTPS の両方のロードバランサーについて書いてあり、作られているほうにだけ
作られます。HTTP と HTTPS を切り替えても、アラートの設定を変える必要はありません。

通知が来たら、API のログを確認します：AWS は CloudWatch Logs の `/aws/ecs/api-service`、Google Cloud は Cloud Logging
（Cloud Run のサービス `web-service-with-lb`、またはジョブ `<PROJECT_NAME>-google-journal-prune`）、Azure は Log Analytics の
`ContainerAppConsoleLogs`。エラーの意味と対処は、アプリのリポジトリの運用手順に書いています。

### 設定

| クラウド | 設定 | 通知先 | アラーム |
|---|---|---|---|
| AWS | `config/aws/monitoring.ts`（`awsAlertingConfig`） | `notificationTargets`（通知先ごとに SNS トピック 1 つ、アドレスごとにメールのサブスクリプション 1 つ） | `metricFilters`（`cloudwatchlogs.ts` のロググループ）、`alarms` |
| Google Cloud | `config/google/monitoring.ts`（`googleAlertingConfig`） | `notificationTargets`（アドレスごとにメールの通知チャネル 1 つ） | `logMetrics`、`alertPolicies` |
| Azure | `config/azure/azuremonitor.ts` | `azureMonitorConfig.actionGroups` | `azureAlertingConfig.logAlerts`（スケジュールされたクエリルール、v2 API）、`azureAlertingConfig.metricAlerts` |

- アラームは、`notify` に通知先の `key` を書いて参照します。AWS のアラームは、`notifyOnOk: true` で回復時にも通知します。
- アラームの対象は、設定の名前で書きます（AWS: `ClusterName` / `ServiceName` などのメトリクスのディメンション、ALB の `LoadBalancer` のディメンションは `loadBalancer: <ALB の名前>`。Google Cloud: `resource.labels.service_name` などのラベルのフィルター、そのロードバランサーがあるときだけ作るには `loadBalancer: <名前>`。Azure: `target: { type: "containerApp" | "applicationGateway", name }` と、絞り込みの `dimensions`）。存在しないキーや名前があると、合成がエラーで止まります。
- Azure のログアラートは、`scopes` を指定しなければ、`azureMonitorConfig` の Log Analytics ワークスペースに対して実行されます。
- Google Cloud：アラートポリシーはログベースの指標の直後に作られます。指標がまだ見つからないというエラーで deploy が失敗したら、もう一度実行してください。

### AWS — メールのサブスクリプションを確認する

`cdktn deploy` の後、SNS が各アドレスに確認のメールを送ります。受信者がメールのリンクをクリックするまで、サブスクリプションは `PendingConfirmation` のままで、アラームは届きません。状態は SNS のコンソール（トピック → 対象のトピック → サブスクリプション）で確認します。Terraform ではサブスクリプションを確認できません。

## シークレット

API と論理レプリケーション（FEAT-01）が使う DB のパスワードは、各クラウドのシークレットストアに保存します。`clouds.<cloud>.features.dbs` を有効にすると作られます。cdktn が作るのはストアとダミーの値だけで、本当の値は、作業用の VM から各クラウドの CLI で、自分のアカウントでサインインして入れます。その後、Terraform は値を変えません。

| クラウド | ストア | cdktn が作るもの | 本当の値の入れ方 | 設定 |
|---|---|---|---|---|
| AWS | Secrets Manager | 値が `CHANGE_ME` のシークレット | `aws secretsmanager put-secret-value` | `config/aws/secrets.ts` |
| Google Cloud | Secret Manager | 最初のバージョンが `CHANGE_ME` のシークレット | `gcloud secrets versions add`（新しいバージョン） | `config/google/secrets.ts` |
| Azure | Key Vault（プライベートエンドポイントのみ） | Key Vault とロールの割り当て。**シークレットは作らない** | `az keyvault secret set`（Azure の VM からのみ） | `config/azure/secrets.ts` |

シークレットの名前（既定の名前。設定ファイルを参照）:

| シークレット | AWS | Google Cloud | Azure（Key Vault `multicloud-kv-001`。ほかの環境では `-stg` / `-prod` が付く） |
|---|---|---|---|
| API のロールのパスワード（`DB_PASSWORD`） | `multicloud-aws-secret-db-api-password` | `multicloud-google-secret-db-api-password` | `db-api-password` |
| レプリケーションのロールのパスワード | `multicloud-aws-secret-db-repl-password` | `multicloud-google-secret-db-repl-password` | `db-repl-password` |

API のロールのパスワードは**全ノードで同じ**です。すべてのクラウドの `db-api-password` に同じ値を設定します。
各クラウドの API コンテナは、これを `DB_PASSWORD` とすべての `DB_<NODE>_PASSWORD` に使います
（`config/apicontainer.ts`。アプリのリポジトリの getting-started）。レプリケーションのパスワードも全ノードで同じです。

Azure: Container App が Key Vault のシークレットを参照するのは `apiContainerConfig.azureSecretReady` が `true` の
ときだけです（構築の段階 2 以降）。参照するシークレットがないと Container App は起動できません。段階 1 で deploy し、
Azure の VM から `db-api-password` を設定してから、`npm run build-stage -- 2` にしてもう一度 deploy します。

cdktn に渡した値（`CHANGE_ME` と、`.env.<環境名>` の DB の管理者パスワード）は、Terraform の state に残ります。state は作業端末だけに置いてください。

### 前提

- 値を入れるクラウドに、作業用の VM があること。`config/commonsettings.ts` の `clouds.<cloud>.features.vms` を有効にして deploy します。Azure の Key Vault にはプライベートエンドポイントからしか接続できないため、Azure の値は Azure の VM（VNet の中）からしか入れられません。作業が終わったら、`vms` を無効に戻してもかまいません。
- 作業用の VM に、AWS CLI v2、Google Cloud CLI、Azure CLI が入っていること（VM の作成時に `scripts/vm_init.sh` がインストールします）。`aws --version`、`gcloud --version`、`az version` で確認します。
- 自分のアカウントに、次の権限があること。
  - AWS: シークレットに対する `secretsmanager:PutSecretValue` と `secretsmanager:GetSecretValue`。
  - Google Cloud: `roles/secretmanager.secretVersionAdder` と `roles/secretmanager.secretAccessor`（Secret Manager API を有効にしておくこと。getting-started.ja.md を参照）。
  - Azure: Key Vault に対する `Key Vault Secrets Officer`。cdktn は、cdktn を実行する ID と、`.env.<環境名>` の `AZURE_KEYVAULT_SECRETS_OFFICER_IDS`（カンマ区切り。自分の ID は `az ad signed-in-user show --query id -o tsv`）のオブジェクト ID に、このロールを割り当てます。値を入れる前に自分の ID を追加して deploy してください。ないと `az keyvault secret set` が `ForbiddenByRbac` で失敗します。割り当ての反映には数分かかることがあります。

### VM でのサインインとサインアウト

自分のアカウントでサインインします。コマンドが URL を表示するので、自分の端末のブラウザで開いてサインインし、求められたらコードを貼り付けます。認証情報は VM のホームディレクトリに保存されるため、作業が終わったらサインアウトしてください。

| クラウド | サインイン | サインアウト |
|---|---|---|
| AWS（コンソールのサインイン） | `aws login --remote --region ap-northeast-1` | `aws logout` |
| AWS（IAM Identity Center） | `aws configure sso`（初回）の後、`aws sso login --use-device-code` | `aws sso logout` |
| Google Cloud | `gcloud auth login --no-launch-browser` の後、`gcloud config set project <プロジェクト ID>` | `gcloud auth revoke --all` |
| Azure | `az login --use-device-code` の後、`az account set --subscription <サブスクリプション ID>` | `az logout` |

CLI を使う前に、サインインできているかを確認してください。次の点に注意します：

| クラウド | 確認 | 注意点 |
|---|---|---|
| AWS | `aws sts get-caller-identity` | 必ず `--remote` を付けます。付けないと、サインインの後に自分の端末のブラウザが `127.0.0.1` に戻ろうとして接続を拒否され、VM 側のコマンドは待ったままになります（Ctrl+C で止め、`--remote` を付けて再実行）。サインインしないと `NoCredentials` で失敗します |
| Google Cloud | `gcloud config list account`（`…-compute@developer.gserviceaccount.com` ではなく自分のアカウント） | サインインするまで、gcloud は VM の既定のサービスアカウントを使います。そのアクセス スコープではこれらのコマンドを実行できず、`PERMISSION_DENIED: Request had insufficient authentication scopes`（`ACCESS_TOKEN_SCOPE_INSUFFICIENT`）になります。サインインしてください（VM のスコープは広げないでください） |
| Azure | `az account show` | — |

### 値を入れる（初回と、パスワードを変えるとき）

2 つのパスワードは、どちらも**すべてのクラウドで同じ値**です：

- `db-api-password`（API のロール `app_api`）：すべての API がすべてのノードに接続するため（アプリのリポジトリの getting-started）。
- `db-repl-password`（レプリケーションのロール `app_repl`）：使うのは DB のスクリプトだけです。1つの値にすると、どれか1台の VM で、そのクラウドのシークレットストアだけからすべてのパスワードを読めます。単体で動かすクラウド（`apiContainerConfig.topology` が `independent`）では使いません。

2 つの値を一度だけ決めて控えます（パスワードマネージャーなど）：

```bash
openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32; echo   # 2 回実行：API 用、レプリケーション用
```

その後、クラウドごとに、そのクラウドの CLI だけにサインインして（AWS と Google Cloud は Cloud Shell か VM、Azure は VM。Key Vault には Azure の VNet からしか接続できません）、アプリのリポジトリのスクリプトをクラウドの名前を付けて実行し、聞かれたら 2 つの値を貼り付けます：

```bash
git clone https://github.com/Otazoman/multipleclouds-api-app.git   # clone 済みなら git pull
cd multipleclouds-api-app
scripts/secrets-set.sh aws        # 他のクラウドでは google / azure
```

サインインを確認し、そのクラウドの 2 つのシークレットを設定し（値は自分だけが読めるファイルを通して渡すので、シェルの履歴やプロセスの一覧に出ません）、読み戻して確認して、最後に `Done` と表示します。レプリケーションの質問で Enter を押すと、そのシークレットは変えません。終わったらサインアウトします。

パスワードを変えた後は、DB が新しい値を使うようにロールの設定（次の節）をもう一度実行し、そのクラウドの API を再起動してください。

### DB のスクリプトで値を使う

DB のスクリプトはアプリのリポジトリのものです。そのリポジトリの getting-started（「データベースのセットアップ」）を
参照してください。クラウド単体なら、`scripts/node-setup.sh <cloud>` が、VM でクラウドの CLI にサインインしていれば
API のパスワードをそのクラウドのシークレットストアから読み取ります。クラスタでは、どれか1台の VM で
`scripts/cluster-setup.sh <cloud>` を実行し、そのクラウドのシークレットストアから 2 つのパスワードを読みます。データベース同士は
プライベート DNS の名前で接続します（Cloud SQL はピアリングされた DNS ドメイン経由。configuration/google.ja.md）。

### クラウドの CLI の更新

`gcloud` と `az` は `sudo apt update && sudo apt upgrade` で更新します。AWS CLI は、インストーラをもう一度実行して更新します（Google Cloud の VM は `scripts/vm_init.sh` が起動スクリプトなので、起動のたびに更新されます）。

```bash
cd "$(mktemp -d)"
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o awscliv2.zip
unzip -q awscliv2.zip && sudo ./aws/install --update
```

## 既知の問題

### Google Cloud — Cloud Run: サブネットを削除できない（1〜2 時間待ってから、もう一度 destroy）

```
Error 400: The subnetwork resource '.../subnetworks/<vpc>-app-subnet' is already being used by
'.../addresses/serverless-ipv4-...', resourceInUseByAnotherResource
```

Cloud Run のダイレクト VPC 下り（Direct VPC egress）は、Terraform が管理しない内部 IP アドレス（`serverless-ipv4-*`）を予約します。Google Cloud がこれを解放するのは、**Cloud Run のサービスを削除してから 1〜2 時間後**です。それまでは、サブネット（と VPC）を削除できません。

最初の destroy から 1〜2 時間後に、`cdktn destroy` をもう一度実行してください。残ったサブネットと VPC が削除されます。
参考: [Direct VPC egress with a VPC network](https://cloud.google.com/run/docs/configuring/vpc-direct-vpc)

### Google Cloud — リージョンのロードバランサー: プロキシ専用サブネットが使用中

```
Error 400: The subnetwork resource '.../subnetworks/<vpc>-proxy-subnet' is already being used by
'.../forwardingRules/<lb>-http-fw', resourceInUseByAnotherResource
```

転送ルールは、プロキシ専用サブネットより先に削除する必要があります。アプリケーションはこの順序を明示し、サブネットを削除する前に 240 秒待ちます。それでもエラーが出る場合は、`cdktn destroy` をもう一度実行してください。

### Google Cloud — Cloud SQL: プライベート サービス アクセスの接続を削除できない

Cloud SQL を削除している間に、プライベート サービス アクセス（サービス ネットワーキング）の接続の削除が失敗することがあります（[terraform-provider-google#16275](https://github.com/hashicorp/terraform-provider-google/issues/16275)）。

起きた場合:

1. VPC のプライベート サービス アクセスの接続を解除します（VPC ネットワーク → プライベート サービス アクセス）。
2. `cdktn destroy` をもう一度実行します。
3. VPC ネットワークに VPC ピアリングが残っていれば削除します。

### Azure — Container Apps: 最初の destroy が失敗する

Container Apps の destroy は、1 回目に失敗することがあります。`cdktn destroy` をもう一度実行してください。

### Azure — PostgreSQL: サーバーのパラメータを戻せない

サーバーのパラメータ（`wal_level` など）の destroy はサーバーの値を既定に戻す操作で、`InternalServerError`（"An
unexpected error occured while processing the request"）で失敗することがあります。`wal_level` を戻すには再起動が
必要で、データベースに論理レプリケーションのスロットがあると（クラスタ）成功しないためと考えられます。`npm run before-destroy`
が先にパラメータを state から外します（サーバーと一緒に削除されます）。それでもエラーになった場合は、`npm run before-destroy`
と `cdktn destroy` をもう一度実行します。

### AWS — ECR: リポジトリが空でない

```
Error: ECR Repository (<name>) not empty, consider using force_delete: ... RepositoryNotEmptyException
```

CI/CD は ECR のリポジトリにイメージを push します。イメージが入っているリポジトリは削除できません。`ecr.forceDelete`（`config/aws/cicd/cicdsettings.ts`、既定は `true`）を指定すると、リポジトリをイメージごと削除します。この設定は `cdktn deploy` の後に有効になります。この設定より前に deploy したリポジトリ（または `false` のもの）は、手で削除してから、もう一度 destroy してください。

```bash
aws ecr delete-repository --repository-name <name> --force --region ap-northeast-1
cdktn destroy
```

### AWS — Aurora / RDS: CloudWatch のロググループが残る

Aurora / RDS は、削除の途中で CloudWatch のロググループを作り直します。そのため、`destroy` の後に次のロググループが残ることがあります。手動で削除してください。

```
RDSOSMetrics
/aws/rds/cluster/<クラスター名>/audit
/aws/rds/cluster/<クラスター名>/error
/aws/rds/cluster/<クラスター名>/slowquery
/aws/rds/instance/<インスタンス名>/audit
/aws/rds/instance/<インスタンス名>/postgresql
```
