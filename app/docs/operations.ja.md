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

## deploy

```bash
cdktn diff     # 必ず先に plan を確認する
cdktn deploy
```

## destroy

```bash
cdktn destroy
```

マネージドサービスの中には、リソースを非同期に解放するものがあります。そのため、依存関係の順序が正しくても、destroy がエラーで止まることがあります。下の既知の問題を確認し、指示があれば `cdktn destroy` をもう一度実行してください。

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

`config/commonsettings.ts` で `clouds.<cloud>.features.alerting` を有効にすると、クラウドごとにアラートを作ります。一覧はすべて既定で空です。各設定ファイルに、コメントで例があります。

| クラウド | 設定 | 通知先 | アラーム |
|---|---|---|---|
| AWS | `config/aws/monitoring.ts`（`awsAlertingConfig`） | `notificationTargets`（通知先ごとに SNS トピック 1 つ、アドレスごとにメールのサブスクリプション 1 つ） | `metricFilters`（`cloudwatchlogs.ts` のロググループ）、`alarms` |
| Google Cloud | `config/google/monitoring.ts`（`googleAlertingConfig`） | `notificationTargets`（アドレスごとにメールの通知チャネル 1 つ） | `logMetrics`、`alertPolicies` |
| Azure | `config/azure/azuremonitor.ts` | `azureMonitorConfig.actionGroups` | `azureAlertingConfig.logAlerts`（スケジュールされたクエリルール、v2 API）、`azureAlertingConfig.metricAlerts` |

- アラームは、`notify` に通知先の `key` を書いて参照します。AWS のアラームは、`notifyOnOk: true` で回復時にも通知します。
- アラームの対象は、設定の名前で書きます（AWS: `ClusterName` / `ServiceName` などのメトリクスのディメンション、Google Cloud: `resource.labels.service_name` などのラベルのフィルター、Azure: `target: { type: "containerApp", name }`）。存在しないキーや名前があると、合成がエラーで止まります。
- Azure のログアラートは、`scopes` を指定しなければ、`azureMonitorConfig` の Log Analytics ワークスペースに対して実行されます。

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
（`config/apicontainer.ts`。アプリのリポジトリの getting-started）。レプリケーションのパスワードはノードごとです。

Azure: Container App が Key Vault のシークレットを参照するのは `apiContainerConfig.azureSecretReady` が `true` の
ときだけです。参照するシークレットがないと Container App は起動できません。`false` で deploy し、Azure の VM から
`db-api-password` を設定してから、`true` にしてもう一度 deploy します。

cdktn に渡した値（`CHANGE_ME` と、`.env.<環境名>` の DB の管理者パスワード）は、Terraform の state に残ります。state は作業端末だけに置いてください。

### 前提

- 値を入れるクラウドに、作業用の VM があること。`config/commonsettings.ts` の `clouds.<cloud>.features.vms` を有効にして deploy します。Azure の Key Vault にはプライベートエンドポイントからしか接続できないため、Azure の値は Azure の VM（VNet の中）からしか入れられません。作業が終わったら、`vms` を無効に戻してもかまいません。
- 作業用の VM に、AWS CLI v2、Google Cloud CLI、Azure CLI が入っていること（VM の作成時に `scripts/vm_init.sh` がインストールします）。`aws --version`、`gcloud --version`、`az version` で確認します。
- 自分のアカウントに、次の権限があること。
  - AWS: シークレットに対する `secretsmanager:PutSecretValue` と `secretsmanager:GetSecretValue`。
  - Google Cloud: `roles/secretmanager.secretVersionAdder` と `roles/secretmanager.secretAccessor`（Secret Manager API を有効にしておくこと。getting-started.ja.md を参照）。
  - Azure: Key Vault に対する `Key Vault Secrets Officer`。cdktn は、cdktn を実行する ID と、`secretsOfficerPrincipalIds`（`config/azure/secrets.ts`）のオブジェクト ID に、このロールを割り当てます。

### VM でのサインインとサインアウト

自分のアカウントでサインインします。コマンドが URL を表示するので、自分の端末のブラウザで開いてサインインし、求められたらコードを貼り付けます。認証情報は VM のホームディレクトリに保存されるため、作業が終わったらサインアウトしてください。

| クラウド | サインイン | サインアウト |
|---|---|---|
| AWS（コンソールのサインイン） | `aws login --remote --region ap-northeast-1` | `aws logout` |
| AWS（IAM Identity Center） | `aws configure sso`（初回）の後、`aws sso login --use-device-code` | `aws sso logout` |
| Google Cloud | `gcloud auth login --no-launch-browser` の後、`gcloud config set project <プロジェクト ID>` | `gcloud auth revoke --all` |
| Azure | `az login --use-device-code` の後、`az account set --subscription <サブスクリプション ID>` | `az logout` |

### 値を入れる（初回と、パスワードを変えるとき）

各クラウドの VM で、そのクラウドだけにサインインして行います。パスワードは、自分だけが読めるファイルに書き出し（シェルの履歴やプロセスの一覧に出ないようにするため）、最後に削除します。

```bash
umask 077
# シークレットごとにパスワードを作る（英数字 32 文字）
gen() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32; }
gen > ~/db-api-password
gen > ~/db-repl-password
```

AWS の VM:

```bash
for s in db-api-password db-repl-password; do
  aws secretsmanager put-secret-value --region ap-northeast-1 \
    --secret-id "multicloud-aws-secret-$s" --secret-string "file://$HOME/$s"
done
```

Google Cloud の VM:

```bash
for s in db-api-password db-repl-password; do
  gcloud secrets versions add "multicloud-google-secret-$s" --data-file="$HOME/$s"
done
```

Azure の VM（Key Vault には Azure の VNet からしか接続できません）:

```bash
for s in db-api-password db-repl-password; do
  az keyvault secret set --vault-name multicloud-kv-001 --name "$s" \
    --file "$HOME/$s" --encoding utf-8 --output none
done
```

その後、ファイルを削除し、サインアウトします。

```bash
shred -u ~/db-api-password ~/db-repl-password
```

パスワードを変えた後は、DB が新しい値を使うようにロールの設定（次の節）をもう一度実行し、そのクラウドの API を再起動してください。

### DB のスクリプトで値を使う

アプリのリポジトリの DB のスクリプト（`scripts/migrate.sh`、`scripts/api-role-setup.sh`、`scripts/replication-setup.sh`）は、参加するすべての DB のパスワードを必要とします。各 DB がほかの DB に接続するためです。Azure の VM（Key Vault を読める唯一の場所）で、3 つのクラウドすべてにサインインして実行します。値は `replication/nodes.env` に書かず、環境変数として export します。

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
# DB の管理者パスワード（cdktn の .env.<環境名>）: 入力し、画面には表示しない
for n in AWS GOOGLE AZURE; do
  read -rsp "NODE_${n}_ADMIN_PASSWORD: " v && echo && export "NODE_${n}_ADMIN_PASSWORD=$v"
done
```

その後、アプリのリポジトリのスクリプトを実行し（アプリのドキュメントを参照）、終わったら 3 つのクラウドからサインアウトします。レプリケーションに参加しないクラウドは省きます。

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
