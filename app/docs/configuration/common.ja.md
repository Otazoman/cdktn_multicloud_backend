# 共通の設定

[English](common.md)

ファイル: `config/commonsettings.ts`、`config/environment.ts`、`config/naming.ts`、`config/vpn/addressPlan.ts`、リポジトリ直下の `.env`、`.env.<環境名>`。

コードでは `commonsettings.ts` の値を直接 import せず、`config/features.ts`（`isCloudEnabled`、`isFeatureEnabled`）と `config/connections.ts`（`vpnConnections`、`isConnected`）を使います。

## 環境

環境ごとにコンテナを 1 つ（と `.env.<環境名>` を 1 つ）使います。環境は、コンテナを起動するときに `DEPLOY_ENV` で選びます（`DEPLOY_ENV=dev docker compose -p cdktn-dev up -d`）。

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `DEPLOY_ENV`（環境変数） | deploy する環境 | `dev`、`stg`、`prod`（`config/environment.ts` の一覧 `ENVIRONMENTS`） | **必須** | 未指定や不明な値では synth が止まる。`compose.yaml` が設定する |
| `ENVIRONMENTS` | 環境名の一覧 | 文字列の配列 | `["dev", "stg", "prod"]` | 環境を増やすとき: ここに追加し、`.env.<環境名>` を作り、`default` のない `byEnv` をすべて埋める（型エラーで場所が分かる） |
| `byEnv({...})` | 環境ごとの値 | すべての環境（`{ dev, stg, prod }`）、または `{ default, <環境名>?: ... }` | — | 設定ファイルの読み込み時に評価される |
| `envScopedName(base, { hyphen })` | 環境ごとに一意である必要がある名前 | `-` を使えない名前は `hyphen: false` | `hyphen: true` | `dev` は `base` のまま。ほかの環境は `-<環境名>`（または `<環境名>`）が付く。Key Vault、ACR、Azure DB のサーバー、Azure Files のアカウントで使う |
| state のファイル | Terraform の state | `state/<環境名>/terraform.tfstate` | — | ローカル、Git の管理外。秘密の値が平文で含まれる |

## アカウント（`accounts`）

ある環境の認証情報で別の環境を変更できないように、環境ごとのアカウントを書きます。provider は、ほかのアカウントでの実行を拒否します。

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `accounts.awsAccountId` | AWS のアカウント ID | 12 桁の文字列 | —（確認しない） | AWS の provider に `allowedAccountIds` として渡す |
| `accounts.azureSubscriptionId` | Azure のサブスクリプション ID | GUID の文字列 | —（`ARM_SUBSCRIPTION_ID` を使う） | azurerm の provider に `subscriptionId` として渡す |
| Google Cloud のプロジェクト | 環境のプロジェクト | `config/google/common.ts` の `PROJECT_NAME`（[google.ja.md](google.ja.md) を参照） | Google Cloud を有効にする環境では**必須** | 空だと synth が止まる |

例: `byEnv({ default: {}, stg: { awsAccountId: "123456789012", azureSubscriptionId: "..." } })`。

## クラウドと機能の切り替え（`clouds`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `clouds.<aws\|google\|azure>.enabled` | そのクラウドのネットワークと、それに依存するすべてを作る | `boolean` | すべてのクラウドで `true` | `false` にすると、VPN の端も含めてそのクラウドを丸ごと作らない |
| `...features.vms` | VM | `boolean` | `true`（すべてのクラウド） | |
| `...features.dbs` | マネージドのリレーショナル DB（とそのシークレット） | `boolean` | `false`（すべてのクラウド） | PostgreSQL のみ |
| `...features.storage` | ファイルストレージ（EFS / Filestore / Azure Files） | `boolean` | `false` | |
| `...features.containers` | マネージドコンテナとそのロードバランサー | `boolean` | `false` | |
| `...features.cicd` | CI/CD | `boolean` | `false` | |
| `...features.dns` | 公開 DNS のゾーンとレコード | `boolean` | `false` | `false` では公開ゾーンと A レコードを作らない。AWS のマネージド証明書は検証に公開ゾーンが必要なため、これも作られない |
| `...features.alerting` | 通知先とアラーム / アラートポリシー | `boolean` | AWS `false`、Google `false`、Azure `true` | |
| `...features.logArchive` | コンテナのログをオブジェクトストレージに保管する | `boolean` | `false` | バケット / アカウントの名前を、そのクラウドの監視の設定に書く必要がある |

機能は、クラウドとその機能の両方が有効なときに作られます。VPN の接続は、これらの切り替えに影響しません。

## クラウド間の VPN

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `useVpn` | VPN のリソースをそもそも作るか | `boolean` | `true` | |
| `awsToGoogle` | AWS と Google Cloud の直接の VPN | `boolean` | `true` | |
| `awsToAzure` | AWS と Azure の直接の VPN | `boolean` | `true` | |
| `googleToAzure` | Google Cloud と Azure の直接の VPN | `boolean` | `true` | 直接の接続を 2 つ持つクラウドは、残りの 2 つのハブになる（BGP、`haBgp` のみ） |
| `vpnMode` | VPN の方式 | `"singleTunnel"`: 接続ごとにトンネル 1 本、静的ルート（Google Cloud は Classic VPN）。`"haBgp"`: 接続ごとにトンネル 2 本、BGP（HA VPN） | `byEnv`: `dev` `singleTunnel`、`stg` `singleTunnel`、`prod` `haBgp` | [VPN](../networking/vpn.ja.md) を参照 |
| `hostZones` | プライベート DNS ゾーンと、クラウド間の DNS 転送 | `boolean` | `false` | |

### VPN のアドレスの割り当て（`config/vpn/addressPlan.ts`、`haBgp` のみ）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `vpnAddressPlan.awsAzure.tunnels[i][t]` | AWS–Azure のトンネルの BGP の内側のアドレス（`i`: Azure のゲートウェイのインスタンス、`t`: AWS のトンネル） | `{ insideCidr, awsIp, azureIp }`。`169.254.0.0/16` の中の `/30` | `169.254.21.0/30`、`.21.4/30`、`.22.0/30`、`.22.4/30` | 両方の IP が `/30` のホストアドレスであること。Azure 側は `169.254.21.0`〜`169.254.22.255` の中。`__tests__/addressPlan.test.ts` で確認 |
| `vpnAddressPlan.googleAzure.tunnels[i]` | Google–Azure の同じもの | `{ insideCidr, googleIp, azureIp }` | `169.254.21.8/30`、`169.254.22.8/30` | すべてのペアで `/30` の範囲が重ならないこと |
| `vpnAddressPlan.googleAzure.presharedKey` | Google–Azure のトンネルの事前共有鍵 | `GOOGLE_AZURE_VPN_PRESHARED_KEY` の文字列 | Google–Azure では**必須** | AWS–Google は AWS が割り当てるアドレスを使う（項目なし） |

ASN は、各クラウドの `vpn.ts` に書きます。

## CI/CD（`config/cicd.ts`）

すべてのクラウドの CI/CD（機能 `cicd`）で共通です。ビルドの定義は、アプリのリポジトリ（`buildspec.yml`、`cloudbuild.yaml`）にあります。

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `appRepository.owner`、`appRepository.name` | アプリの GitHub のリポジトリ | 文字列 | `Otazoman`、`multipleclouds-api-app` | `appRepositoryUrl` はこれから作られる |
| `cicdTrigger.branches` | push（マージされたプルリクエスト）でビルドを起動するブランチ | ブランチ名そのもの、`byEnv` | dev `["dev"]`、stg `["staging"]`、prod `["prod"]` | クラウドごとに正規表現に変換される |

## API コンテナ（`config/apicontainer.ts`）

API コンテナの設定（FEAT-01 §9 #5）。各クラウドの CI/CD のデプロイ先（ECS サービス、Cloud Run サービス、Container App）に、そのクラウドの `dbs` 機能が有効なときに適用します。`topology` が `cluster` ならノードは `dbs` が有効なクラウド、`independent` なら各クラウドが単体のノードです（`PEER_NODES` は空）。各 API には `CLOUD_ID`、`DB_HOST`、`DB_NAME`、`DB_USER`、`DB_SSLMODE`、`PEER_NODES`、`DB_<NODE>_HOST` を平文の変数として、`DB_PASSWORD` とすべての `DB_<NODE>_PASSWORD` を自クラウドのシークレット `db-api-password` から渡します。`DB_HOST` は自クラウドの PostgreSQL の接続先です（Aurora のクラスタのエンドポイント、Cloud SQL のプライベート IP、Azure の FQDN。そのクラウドで作る PostgreSQL はちょうど1つであること）。このため、クラウド単体では VPN もプライベート DNS も不要です。`DB_<NODE>_HOST` は他ノードのプライベート DNS 名です（ECS は `secrets` と実行ロールへの読み取り権限、Cloud Run はシークレットの参照と既定の Compute サービスアカウントへの読み取り権限、Container Apps は Key Vault の参照とユーザー割り当てのマネージド ID への「Key Vault Secrets User」）。

| 項目 | 説明 | 指定できる値 | 既定 | 備考 |
|---|---|---|---|---|
| `database.name` | 各ノードの API のデータベース | 文字列 | `appdb` | アプリのスクリプトは全ノードで1つの名前を使う |
| `database.user` | API が接続するロール | 文字列 | `app_api` | アプリの `scripts/api-role-setup.sh` が作る |
| `database.sslMode` | `DB_SSLMODE` | `disable`、`require`、`verify-full` | `require` | |
| `topology` | `cluster`：データベースのあるクラウドで1つのクラスタになる（2つ以上なら `useVpn`・`hostZones`・それらの間の VPN 接続が必要。無ければ合成が失敗する）。`independent`：各クラウドが自分のデータで単体で動く | `cluster`、`independent`、`byEnv` | `cluster`。dev は `independent` | 単体のクラウドを後からクラスタにすると、データが残るのは1つのクラウドだけ |
| `database.privateDnsNames.<cloud>` | 各ノードのデータベースのプライベート DNS 名。他のクラウドの API が使う（`DB_<NODE>_HOST`） | プライベート DNS 名 | `aurora-postgres.aws.inner`、`cloudsql-postgres.google.inner`、`postgres-prod.azure.inner` | クラスタのみ。プライベート DNS のレコードと合わせる |
| `passwordSecretKey` | `app_api` のパスワードのシークレット | `config/<cloud>/secrets.ts` のキー | `db-api-password` | すべてのクラウドで同じ値 |
| `azureSecretReady` | Container App から Key Vault のシークレットを参照する | `boolean`、`byEnv` | `false` | Azure の VM からシークレットを設定した後に `true`（[operations.ja.md](../operations.ja.md) の「シークレット」） |
| `readinessProbe` | `/readyz` を readiness（ALB のターゲットグループ、Cloud Run の startup probe、Container Apps の readiness probe）、`/healthz` を liveness に使う | `boolean`、`byEnv` | `false` | 仮のイメージは `/` にしか応答しない。CI/CD が API をデプロイした後に `true` |

| `journalPrune.enabled` | 古い変更履歴（ジャーナル）を削除するスケジュール実行のジョブ（アプリの `node dist/prune.js`）。データベースのあるすべてのクラウドに作る | `boolean`、`byEnv` | `false` | CI/CD が API をデプロイした後に `true`（Google Cloud と Azure は、API のサービスの現在のイメージでジョブを作る）。Azure は `azureSecretReady` も必要。Google Cloud は Cloud Scheduler API が必要 |
| `journalPrune.retentionDays` | ジョブの `JOURNAL_RETENTION_DAYS` | 日数 | `30` | 冪等キーの有効期間でもある |
| `journalPrune.schedules.<cloud>` | クラウドごとの毎日の実行時刻（各クラウドの書式） | cron | AWS `cron(0 3 * * ? *)`、Google `20 3 * * *`（`timeZone`）、Azure `40 18 * * *`（UTC） | クラウドごとに時刻をずらす。削除するのはプライマリだけ |
| `journalPrune.timeZone` | AWS と Google Cloud のスケジュールのタイムゾーン | IANA の名前 | `Asia/Tokyo` | Container Apps のジョブは UTC |
| `journalPrune.names.<cloud>` | ジョブの名前 | 文字列 | `<PROJECT_NAME>-<cloud>-journal-prune` | |

ジョブは API のイメージを API と同じ設定で実行します。AWS は EventBridge Scheduler が API のタスク定義の最新のリビジョンをコマンドを差し替えて実行します（CI/CD の手順は不要）。Google Cloud は Cloud Scheduler が Cloud Run のジョブを、Azure はスケジュール実行の Container Apps のジョブを起動し、これらのイメージは CI/CD が API と一緒に更新します（`_PRUNE_JOB`、`PRUNE_JOB_NAME`）。

ECS サービスはタスク定義の変更を無視します（CI/CD が新しいリビジョンをデプロイするため）。環境変数を変えると、ファミリーの新しいリビジョンとして登録され、アプリの `buildspec.yml` が次のデプロイでそれを元にします（`TASK_FAMILY`）。

## 命名

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `PROJECT_NAME`（`config/naming.ts`） | 既定の名前の接頭辞 | 文字列 | `multicloud` | 既定の名前: `<PROJECT_NAME>-<cloud>-<リソースの種類>[-<key>]`。リソースの命名規則（文字、長さ）に合わせて調整される。`config/google/common.ts` の Google Cloud の `PROJECT_NAME` とは別物 |

## 認証情報と秘密の値（リポジトリ直下）

| ファイル | 内容 |
|---|---|
| `.env` | ツールのバージョンだけ（`NODE_VERSION`、`TERRAFORM_VERSION`、`OPENTOFU_VERSION`）。イメージのビルドと、`compose.yaml` の `${}` に使う |
| `.env.<環境名>` | 1 つの環境の認証情報と秘密の値（`.env.ENV.sample` をコピー）。Git の管理外 |

| 変数 | 内容 | 使われる場所 | 備考 |
|---|---|---|---|
| `AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY` | AWS の認証情報 | AWS の provider | `accounts.awsAccountId` を設定したときは、そのアカウントと一致すること |
| `ARM_SUBSCRIPTION_ID`、`ARM_CLIENT_ID`、`ARM_CLIENT_SECRET`、`ARM_TENANT_ID`、`ARM_ENVIRONMENT` | Azure のサービスプリンシパル | azurerm の provider | `ARM_ENVIRONMENT`: `public` など |
| `GOOGLE_CLOUD_KEYFILE_JSON` | コンテナ内のサービスアカウントキーのファイルのパス | Google の provider | 環境ごとに 1 つのキー |
| `GOOGLE_CLOUD_PROJECT` | プロジェクト ID | Google の provider | 実際に使うプロジェクトは `config/google/common.ts` の `PROJECT_NAME` |
| `AWSDB_ROOT_USER`、`AWSDB_ROOT_PASSWORD` | RDS / Aurora のマスターユーザー | `config/aws/aurorards/aurorards.ts` | |
| `GOOGLEDB_ROOT_USER`、`GOOGLEDB_ROOT_PASSWORD` | Cloud SQL の管理者ユーザー | `config/google/cloudsql/cloudsql.ts` | |
| `AZUREDB_ROOT_USER`、`AZUREDB_ROOT_PASSWORD` | Azure Database for PostgreSQL の管理者ユーザー | `config/azure/azuredatabase/databases.ts` | |
| `AZURE_APPGW_SSL_CERT_PASSWORD` | PFX 証明書のパスワード | `config/azure/applicationgateway.ts` | PFX を取り込む HTTPS のパターンのときだけ |
| `GOOGLE_AZURE_VPN_PRESHARED_KEY` | 事前共有鍵 | `config/vpn/addressPlan.ts` | |
| `ECS_WORKER_POSTGRES_PASSWORD` | サンプルの worker コンテナのパスワード | `config/aws/ecs.ts` | |
| `AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID` | サービスプリンシパル DevOpsInfrastructure のオブジェクト ID | `config/azure/cicd.ts` | Azure の CI/CD のみ。秘密の値ではないが、テナントごとの値なので Git に入れない |

引用符: `.env.<環境名>` は Docker Compose が読みます。`$` を含む値は**シングルクォート**で囲みます（囲まないと、ダブルクォートの中でも `$...` が展開されます）。` #` を含む値も引用符で囲みます。
