# FEAT-01 アクティブ / アクティブ構成 設計方針

- 作成日: 2026-10-04（同日改訂: ユーザー決定を反映）
- ステータス: **方針確定・cdktn 側の作業とアプリのディレクトリの承認待ち（§9・§10）。CI/CD 連携の残課題を §12 に整理（2026-10-10。2026-10-11 に検討予定）**
- 関連: `docs/ai/vpn_refactor_plan.md` の FEAT-01 / FEAT-02、`docs/ai/feat03_monitoring_design.md`

## 1. 目指す構成

```
アプリのリポジトリ（GitHub、別リポジトリ）
   │ merge
   ├─▶ AWS:    CodeBuild    ─▶ ECR              ─▶ ECS (Fargate)    ─▶ RDS / Aurora PostgreSQL ─┐
   ├─▶ Google: Cloud Build  ─▶ Artifact Registry ─▶ Cloud Run        ─▶ Cloud SQL PostgreSQL ────┼─ 双方向
   └─▶ Azure:  （§6）       ─▶ ACR              ─▶ Container Apps   ─▶ Azure DB PostgreSQL ─────┘  レプリケーション
                                                   API: TypeScript / GraphQL（CRUD）            （VPN 経由）
```

## 2. 決定事項（ユーザー確認済み）

| 項目 | 決定 |
|---|---|
| 方式 | アクティブ / アクティブ（各クラウドの API が自クラウドの DB に書き込む） |
| DB エンジン | **PostgreSQL**（3クラウドとも 18） |
| 競合 | **アプリ側で制御する**（§4 は考え方の参考） |
| CI/CD | **各クラウドの仕組みを使う**（GitHub Actions はビルドが分散するため使わない） |
| VPN | 作成済み。**2クラウドの場合も 3クラウドの場合もある** |
| レプリケーションの設定 | 作業用 VM からのシェルスクリプト、または各クラウドのコンテナジョブ（どちらでも可） |
| シークレット・パラメータ | **cdktn は入れ物とダミーの初期値（Azure は Key Vault のみ）。本当の値は作業者が各クラウドの VM から CLI で入れる**（§7、2026-10-11 改訂） |
| アプリ | **別リポジトリ**。API は **TypeScript + GraphQL** で CRUD |
| cdktn の範囲 | インフラを作るところまで |

## 3. 責任の分担

| 項目 | cdktn | アプリのリポジトリ |
|---|---|---|
| ネットワーク・VPN・DNS、DB 間の通信許可 | ○ | |
| DB インスタンスと論理レプリケーションのパラメータ | ○ | |
| コンテナの実行環境・レジストリ（初期イメージは仮のもの） | ○ | |
| CI/CD の受け皿（トリガー、権限、レジストリへのアクセス） | ○ | |
| シークレットの**入れ物とダミーの初期値** | ○ | |
| シークレットの**本当の値**（作業者が VM から CLI で入れる。手順は cdktn の `docs/operations.md`） | | ○ |
| ビルド手順（`buildspec.yml` / `cloudbuild.yaml` / Azure の手順） | | ○ |
| API・Dockerfile・テーブル定義（マイグレーション） | | ○ |
| レプリケーションの設定（publication / subscription）とその実行スクリプト | | ○ |
| 競合の制御 | | ○ |

## 4. 書き込みの競合（アプリ側で制御。参考）

PostgreSQL 標準の論理レプリケーションには、競合を自動で解決する仕組みがない。

| 状況 | 起きること |
|---|---|
| 同じ主キーの行を2つのクラウドで INSERT | 受け取った側で一意制約違反になり、レプリケーションが止まる |
| 同じ行をほぼ同時に2つのクラウドで UPDATE | ノードごとに値が食い違ったままになる（エラーにならない） |
| 相手側で削除済みの行を UPDATE / DELETE | 受け取った側ではスキップされる |

アプリ側の制御の例: 主キーを UUID にする、行ごとに「作成したクラウド」を持ち、更新・削除は所有するクラウドの API だけが行う、行にバージョン番号を持たせて更新時に確認する、など。

## 5. 参加するクラウドが 2 つの場合と 3 つの場合

- レプリケーションに参加するのは、**`dbs` 機能が有効で、VPN でつながっているクラウド**とする（`config/features.ts` と `config/connections.ts` から決まる）。
- 3つの場合は各 DB が他の2つを購読（6本）、2つの場合は相互に購読（2本）。購読は `origin = none` を指定する（PostgreSQL 16 以降。ループしない）。
- ハブ構成（例: AWS–Azure と Google–Azure だけ直接接続）でも、Azure の VPN ゲートウェイの中継で AWS–Google 間の DB 通信は可能。ただし遅延と帯域の制約を受ける。
- インフラ側（通信許可など）は、参加するクラウドの組み合わせから自動で作る（クラウドの追加にも対応できるよう、ペアごとに書かない）。

## 6. CI/CD（各クラウドの仕組み）

| クラウド | 仕組み | 現状 | 必要な対応 |
|---|---|---|---|
| AWS | **CodeBuild + ECS ネイティブ Blue/Green**（決定） | **マージを検知する webhook がない**。ビルド手順は ECR へのプッシュまでで、ECS へのデプロイがない。ECS サービスは Blue/Green の設定済みで、タスク定義等の変更は Terraform が無視する設定（`ignore_changes`）あり | webhook（ブランチのマージで起動）を追加。アプリのリポジトリの `buildspec.yml` で、イメージのプッシュ → タスク定義の新しいリビジョン登録 → `ecs update-service`（ECS が Blue/Green で切り替え）。CodeBuild のロールに ECR プッシュ、`ecs:RegisterTaskDefinition` / `UpdateService` / `DescribeServices`、タスク用ロールの `iam:PassRole` を付与 |
| Google | Cloud Build トリガー（GitHub）→ Artifact Registry | ブランチのマージで、リポジトリの `cloudbuild.yaml` を実行する形（アプリ側の手順で Cloud Run にデプロイできる） | GitHub との接続（リポジトリの登録）、Cloud Run のデプロイ権限を持つサービスアカウント（DEAD-02 の `GcpIamResources` を利用できる） |
| Azure | **推奨: ACR Tasks**（(b) Azure DevOps は FEAT-02） | ACR のみ | ACR Tasks の「コミットトリガー」は、指定ブランチへのコミットを GitHub の webhook で検知して起動する。PR のマージはマージ先ブランチへのコミットになるため、**マージで起動できる**（GitHub Enterprise のリポジトリは対象外。GitHub のアクセストークンが必要）。複数ステップの手順（アプリのリポジトリに置く）で、ビルド・プッシュ → マネージド ID で Container Apps を更新。デプロイ部分は最初に検証する |

## 6.1 CI/CD がコンテナを更新することへの対応

CI/CD が新しいイメージでコンテナを更新すると、Terraform の設定と実際の状態がずれ、次の `cdktn deploy` で cdktn が最初に作ったイメージに戻してしまう。CI/CD が更新する項目は Terraform に無視させる。

| クラウド | 対象 | 現状 |
|---|---|---|
| AWS ECS | `task_definition`（Blue/Green では `load_balancer`、オートスケーリング時は `desired_count` も） | **対応済み** |
| Cloud Run | コンテナのイメージ（とデプロイ時に付く属性） | 未対応 → 追加 |
| Container Apps | コンテナのイメージ（リビジョン） | 未対応 → 追加 |

## 7. シークレット・パラメータ（cdktn は入れ物とダミー値、本当の値は VM から CLI で入れる）

**決定（2026-10-11）**: cdktn はシークレットの入れ物とダミーの初期値までを作り、本当の値は作業者が各クラウドの作業用 VM から CLI で入れる（3 クラウドで手順をそろえる）。値の変更は Terraform に無視させる。手順は `docs/operations.md` の「Secrets」。

| クラウド | 置き場所 | cdktn で作るもの | 本当の値を入れる方法 |
|---|---|---|---|
| AWS | Secrets Manager | シークレットと初期値 `CHANGE_ME`（`secret_string` は `ignore_changes`） | AWS の VM から `aws secretsmanager put-secret-value` |
| Google | Secret Manager | シークレットと最初のバージョン `CHANGE_ME` | Google の VM から `gcloud secrets versions add`（新しいバージョンを追加。Terraform は最初のバージョンだけを持つ） |
| Azure | Key Vault（**新規**。RBAC、パブリックアクセスなし、プライベートエンドポイントのみ） | Key Vault・プライベートエンドポイント・プライベート DNS ゾーン・`Key Vault Secrets Officer` の割り当て（cdktn の実行者と `secretsOfficerPrincipalIds`）。**シークレットは作らない**（データプレーンに VNet の外から接続できないため） | Azure の VM から `az keyvault secret set` |

- 対象（DB 機能が有効なクラウドごと）: API 用ユーザーのパスワード（`DB_PASSWORD`）、レプリケーション用ユーザーのパスワード。ユーザー名・接続先など秘密でない値は置かない（下記）。
- 作業者は各 VM に**自分のアカウントでログイン**する（`aws login --remote` / `aws sso login --use-device-code`、`gcloud auth login --no-launch-browser`、`az login --use-device-code`）。VM には権限（インスタンスプロファイル・サービスアカウントのスコープ・マネージド ID）を付けない。作業後はログアウトする。
- 3 つの CLI（AWS CLI v2、gcloud、az）は `scripts/vm_init.sh` で全 VM に入れる。
- アプリ側の DB スクリプト（`migrate.sh` / `api-role-setup.sh` / `replication-setup.sh`）は、全クラウドのパスワードが必要なため、Key Vault を読める Azure の VM で 3 クラウドにログインして実行する。
- Terraform の state にはダミー値と DB 管理者のパスワード（`config/.env`）が残る。state は作業端末だけで管理しているため許容する（SEC-04）。

### 7.1 環境変数（秘密でない値）

| 種類 | 例 | 正となる場所 | 実際に保存される場所 | コンテナへの届き方 |
|---|---|---|---|---|
| インフラが決める値 | `CLOUD_ID`、`DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER` | cdktn の設定ファイル（`DB_HOST` は DB の設定とプライベート DNS 名から自動で決める） | Terraform の state、各クラウドのコンテナ定義 | コンテナの環境変数（#5） |
| アプリが決める値 | `GRAPHIQL_ENABLED`、`DB_POOL_MAX`、`DB_SSLMODE` | アプリのリポジトリのファイル（例: `config/app.env`、Git 管理） | イメージの中 | 起動時にファイルから読む（`node --env-file-if-exists`。同じ名前の環境変数があればそちらが優先） |
| 秘密の値 | API 用・レプリケーション用のパスワード | 各クラウドのシークレットストア | 同左 | コンテナ定義にはシークレットへの参照だけを持たせる（#5） |

- ECS はタスク定義を Terraform に無視させているため、インフラが決める値を後から変えても cdktn deploy では反映されない（§12.4）。**対応（2026-10-17、#5）**: cdktn が登録するファミリーの新しいリビジョンを、アプリの `buildspec.yml` が次のデプロイの元にする（CodeBuild の環境変数 `TASK_FAMILY`）。
- Container Apps は、参照する Key Vault のシークレットがないとリビジョンを起動できないため、最初の deploy では参照を付けず、値を入れた後で付ける順番にする。**対応（2026-10-17、#5）**: `config/apicontainer.ts` の `azureSecretReady`（既定 `false`）。
- **API の `app_api` パスワードは全ノード共通（2026-10-17 決定。アプリの FEATURE-PLAN §5 の案 A'）**: 各 API は全ノードのパスワードを持つため、分けても漏洩時の影響は変わらない。すべてのクラウドの `db-api-password` に同じ値を VM から入れ、各コンテナは自クラウドのものを `DB_PASSWORD` とすべての `DB_<NODE>_PASSWORD` に使う。新しいシークレットの入れ物は不要。Azure Key Vault は非公開のまま。

## 8. ネットワーク・DB の前提

| 項目 | 現状 | 必要な対応 |
|---|---|---|
| 論理レプリケーションのパラメータ | **設定済み（2026-10-11、§9 #1）** | RDS: `rds.logical_replication=1`（インスタンスのパラメータグループ）、Aurora: 同（クラスタのパラメータグループ）、Cloud SQL: `cloudsql.logical_decoding=on`、Azure: `wal_level=logical` と `max_worker_processes=16`（Azure のドキュメントで 16 以上を推奨）。`max_replication_slots` / `max_wal_senders` は各クラウドの既定値で足りる見込み（未確認。構築時に確認する） |
| DB 間・VM から DB への通信（5432） | **許可済み**: AWS の DB 用 SG は Google（10.1.0.0/16）・Azure（10.2.0.0/16）から、Google は3クラウドの範囲から、Azure の PostgreSQL 用 NSG は `VirtualNetwork` タグ（VPN でつながった先の範囲を含む）から許可 | 変更なし（必要になれば、DB サブネット同士に絞る強化を別途検討） |
| Cloud SQL への経路 | PSA の範囲を Cloud Router が VPN へ広告済み | 変更なし |
| DB の接続名 | プライベート DNS に CNAME を登録する仕組みあり | レプリケーションと API の接続先に使う |
| 作業用 VM / コンテナジョブ | 各クラウドに VM あり。他クラウドの DB へ通信可能（上記） | シェルスクリプトで設定する場合は変更なし。コンテナジョブを使う場合は実行環境を追加 |
| 監視 | FEAT-03 で設計中 | レプリケーションの遅延・停止、スロットの WAL 蓄積を監視対象に加える |

## 9. cdktn 側の作業（案）

| # | 作業 | 主な変更箇所 | 合成結果 |
|---|---|---|---|
| 1 | **（実装済み 2026-10-11）** 論理レプリケーションのパラメータを有効化。ON/OFF はパラメータファイルに書く・書かないで切り替える。AWS は RDS・Aurora のどちらでも対応（Aurora はクラスタのパラメータファイル `aurora-postgres-cluster-parameters.ts` を新規作成）。**Azure はパラメータファイルを読み込むだけで適用していなかったため、MySQL・PostgreSQL とも `*FlexibleServerConfiguration` で適用するように実装**（1件ずつ順に適用。単位付きの値は数値に変換。読み取り専用の `log_connections` は設定しない） | `config/aws/aurorards/*`、`config/google/cloudsql/postgres-parameters.ts`、`config/azure/azuredatabase/postgres-parameters.ts`、`constructs/relationaldatabase/azuredatabase.ts` | 新規構築ではパラメータグループ・フラグは作成時から効くため再起動不要。Azure はサーバー作成後にパラメータを適用するため、静的パラメータ（`wal_level` など）で初回 deploy 中に再起動が入る（provider の `restart_server_on_configuration_value_change`）。作成済みの DB は再起動が必要 |
| 2 | **（Cloud Run は CI/CD の設定とつないだ 2026-10-11。Container Apps は #4 の Azure と一緒に）** Cloud Run / Container Apps で、CI/CD が更新するイメージを Terraform に無視させる（§6.1）。**対象は CI/CD の設定（Cloud Build トリガー・ACR Tasks）でデプロイ先に指定したサービスから自動で決める（決定）**。construct に `ignoreImageChanges` を追加済み。CI/CD の設定とつなぐのは #4 | `constructs/container/googlecloudrun.ts`、`constructs/container/azureaca.ts` | Cloud Run: `template[0].containers[0].image`、`client`、`client_version`。Container Apps: `template[0].container[0].image` を無視（`ignoreImageChanges` が true のサービスのみ） |
| 3 | **（実装済み 2026-10-11）** シークレットの入れ物とダミーの初期値（§7）。Azure は Key Vault を新規作成（シークレットは作らない）。あわせて `scripts/vm_init.sh` に 3 つの CLI のインストールを追加し、`wait_for_apt_lock` の不具合（未定義の `log` と空の `LOCK_FILES` で、ロックを待っていなかった）を修正 | `config/<cloud>/secrets.ts`、`clouds/<cloud>/secrets.ts`、`constructs/secrets/*`（新規）、`clouds/<cloud>/index.ts`、`scripts/vm_init.sh`、`docs/operations.md`、`docs/getting-started.md` | DB 機能が有効なクラウドに、シークレット（AWS・Google 各 2）または Key Vault 一式（Azure）が加わる |
| 4 | CI/CD の受け皿: AWS（webhook、デプロイ権限）、Google（トリガー・権限）、Azure（Managed DevOps Pool + Azure Pipelines） | `constructs/cicd/*`、`config/<cloud>/cicd*`、`config/cicd.ts` | リソースの追加・変更。**AWS・Google は実装済み（2026-10-11）**: 共通設定 `config/cicd.ts`（アプリのリポジトリ、起動するブランチを byEnv）。AWS は CodeConnections の ARN（byEnv）で source を読み、webhook（PUSH、HEAD_REF）、`deployTarget`（ECS サービス名）から `ECS_CLUSTER` / `ECS_SERVICE` / `CONTAINER_NAME` とデプロイ権限（サービスロールへのインラインポリシー）。Google は第2世代の接続（gcloud で作成）にリポジトリを登録し、専用のサービスアカウントで動くトリガー（置換変数 `_REGION` / `_AR_REPOSITORY` / `_SERVICE` / `_WORKER_POOL`）。`deployTarget` の Cloud Run に #2 の `ignoreImageChanges` を自動で付ける。**Azure も実装済み（2026-10-12）**: Managed DevOps Pool と Azure Pipelines（`azuredevops` provider、`cdktn get` で生成）。詳細は `feat04_environments_design.md` §7 |
| 5 | **（実装済み 2026-10-17、未 deploy）** API コンテナの設定。`config/apicontainer.ts`（新規）で、`dbs` が有効なクラウドをノードとし、CI/CD のデプロイ先のコンテナに `CLOUD_ID`・`DB_*`・`PEER_NODES`・`DB_<NODE>_HOST` と、`db-api-password` の参照（`DB_PASSWORD`・`DB_<NODE>_PASSWORD`）を設定。ECS は `secrets` と実行ロールへの `GetSecretValue`、Cloud Run はシークレットの参照と既定の Compute SA への `secretAccessor`、Container Apps は Key Vault の参照とユーザー割り当て ID（`Key Vault Secrets User`、`azureSecretReady` のとき）。`readinessProbe`（既定 `false`、API のデプロイ後に `true`）で ALB のヘルスチェック・Cloud Run の startup / liveness probe・Container Apps の readiness / liveness probe を `/readyz`・`/healthz` に。ECS の環境変数の反映は `TASK_FAMILY`（上記 §7.1）。テスト `__tests__/apicontainer.test.ts` | `config/apicontainer.ts`、`clouds/apicontainer.ts`、`clouds/<cloud>/container.ts`・`secrets.ts`・`context.ts`、`constructs/container/*`、`constructs/cicd/awscicd.ts`、`config/aws/alb.ts` | API のデプロイ先に環境変数・シークレットの参照・権限が加わる。他のサービスは変わらない |
| 6 | （必要なら）レプリケーション設定用のコンテナジョブの実行環境 | 各クラウドのコンテナ construct | リソース追加 |
| 7 | **（実装済み 2026-10-17、未 deploy）** 変更履歴（`app.write_journal`）の削除ジョブ（アプリの `node dist/prune.js`、アプリの FEATURE-PLAN API-07 の案 C）。`apiContainerConfig.journalPrune.enabled`（既定 `false`、API のデプロイ後に `true`）。AWS: EventBridge Scheduler → API のタスク定義の最新リビジョン（`arn_without_revision`）をコマンドを差し替えて実行。Google: Cloud Run ジョブ（初期イメージはデプロイ済みのサービスから読む）と Cloud Scheduler（専用 SA に `run.invoker`）、Cloud Build に `_PRUNE_JOB` とジョブの `run.developer`。Azure: Container Apps ジョブ（同上、`azureSecretReady` が必要）、パイプラインに `PRUNE_JOB_NAME` とジョブの Contributor | `config/apicontainer.ts`、`clouds/<cloud>/container.ts`、`clouds/google/cicd.ts`、`clouds/azure/cicd.ts`、`constructs/cicd/googlecicd.ts` | 有効にしたときだけ、3 クラウドにジョブとスケジューラ・権限が加わる |
| 8 | **（実装済み 2026-10-17）** API の構成を `apiContainerConfig.topology` で選ぶ: `cluster`（DB のあるクラウドで1つのクラスタ。2つ以上なら `useVpn`・`hostZones`・VPN 接続が無いと合成エラー）、`independent`（各クラウドが単体。VPN・DNS 不要。dev の既定）。`DB_HOST` は自クラウドの DB の元の接続先（Aurora のエンドポイント、Cloud SQL のプライベート IP、Azure の FQDN）、`DB_<NODE>_HOST` はプライベート DNS 名。Google・Azure の DB の出力に種類（`databaseVersion`・`type`）を追加 | `config/apicontainer.ts`、`clouds/apicontainer.ts`、`clouds/<cloud>/container.ts`、`clouds/google/database.ts`、`clouds/azure/database.ts` | 1・2・3 クラウドのどの構成でも API が動く |

## 10. 決めていただきたいこと

| # | 項目 | 状態 |
|---|---|---|
| 1 | Azure の CI/CD | 推奨: ACR Tasks（GitHub のマージで起動可能）。ご判断待ち |
| 2 | AWS のデプロイ | **決定: CodeBuild + ECS ネイティブ Blue/Green** |
| 3 | 作業用 VM から他クラウドの DB への通信 | **許可済み（確認済み）** |
| 4 | 着手順 | **決定: §9 の順**（1（DB パラメータ）・2（ignore_changes）→ 3（シークレット）→ 4（CI/CD）→ 5）。#1・#2 は 2026-10-11 に実装 |
| 7 | AWS で参加する DB | **決定: RDS PostgreSQL・Aurora PostgreSQL のどちらでも対応できるようにする** |
| 9 | シークレットの値 | **決定: cdktn はダミー値、本当の値は各クラウドの VM から作業者のアカウントで CLI で入れる**（Cloud Shell は使わず VM にそろえる。Azure の Key Vault はプライベートエンドポイントのみ）（§7） |
| 10 | 環境変数 | **決定: インフラが決める値は cdktn がコンテナの環境変数に、アプリが決める値はアプリのリポジトリのファイルに置く**（§7.1） |
| 8 | Azure のパラメータ適用 | **決定: MySQL・PostgreSQL とも実装する**（既存の値は単位を数値に直して適用。`shared_buffers`・`effective_cache_size` は設定せず、Azure が SKU のメモリから決める既定値を使う） |
| 5 | アプリのリポジトリ | **決定: アプリとインフラ（このリポジトリ）はリポジトリを分ける**。場所・名前・雛形を作るかはご判断待ち（§11） |
| 6 | CI/CD 連携（GitHub とビルドの連携、環境変数・シークレット、ライフサイクルの違い） | **残課題（§12）**。2026-10-11 に検討予定 |

## 11. アプリのリポジトリ（案）

- **アプリとインフラは別のリポジトリ（決定）**。このリポジトリ（cdktn）にはアプリのコードを置かない。
- 場所の案: このリポジトリと並べて `/mnt/dev_data/multicloud_dev/src/<アプリ名>/`
- 構成の案:

```
<アプリ名>/
├ src/                    TypeScript + GraphQL（CRUD API）
├ migrations/             テーブル定義（全クラウドに同じ順で適用）
├ replication/            publication / subscription の設定スクリプト（何度実行しても同じ結果）
├ Dockerfile
├ buildspec.yml           AWS CodeBuild（イメージのプッシュ → タスク定義登録 → ECS 更新）
├ cloudbuild.yaml         Google Cloud Build（イメージのプッシュ → Cloud Run デプロイ）
├ azure-pipelines.yml     Azure Pipelines（イメージのプッシュ → Container Apps 更新。2026-10-12 に acr-task.yaml から置き換え）
└ docs/
```

## 12. 残課題: CI/CD 連携（2026-10-11 検討予定）

`multicloud_api_apps`（アプリ）と `cdktn_multicloud_backend`（インフラ、このリポジトリ）をつなぎ、GitHub のリポジトリへのマージで各クラウドのビルドシステムが動くようにする。検討する論点を以下に整理する（結論はまだ出していない）。

### 12.1 現状（2026-10-10 時点）

| 項目 | 状態 |
|---|---|
| アプリのリポジトリ | `/mnt/dev_data/multicloud_dev/src/multicloud_api_apps`。**コミットなし・リモート（GitHub）未設定**。`buildspec.yml` / `cloudbuild.yaml` / `acr-task.yaml` / `Dockerfile` / `migrations/` / `replication/` はある |
| ビルド定義が外から受け取る値 | AWS: `REPOSITORY_URI` / `ECS_CLUSTER` / `ECS_SERVICE` / `CONTAINER_NAME`（CodeBuild の環境変数）。Google: `_REGION` / `_AR_REPOSITORY` / `_SERVICE` / `_WORKER_POOL`（Cloud Build の置換変数）。Azure: `acr-task.yaml` の値（要確認） |
| アプリが実行時に読む値（`.env.sample`） | `CLOUD_ID`、`PORT`、`GRAPHIQL_ENABLED`、`DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_SSLMODE` / `DB_SSL_CA_FILE` / `DB_POOL_MAX` |
| cdktn 側の CI/CD | §6 のとおり。AWS は webhook とデプロイ権限が未対応、Google はトリガーと GitHub 接続が未対応、Azure は ACR のみ（ACR Tasks は未作成） |
| Terraform に無視させる設定 | ECS は対応済み。Cloud Run / Container Apps は未対応（§6.1） |

### 12.2 論点1: GitHub と各クラウドのビルドシステムの連携

| 論点 | 検討すること |
|---|---|
| 接続方式 | AWS: CodeConnections（GitHub App）か、CodeBuild の webhook（個人アクセストークン）か。Google: Cloud Build の GitHub 接続（第2世代、GitHub App）。Azure: ACR Tasks のコミットトリガー（個人アクセストークンが必要）。どれもコンソールでの承認など、Terraform だけでは完結しない手順があるかを確認する |
| 接続の認証情報 | トークンを使う場合の置き場所（cdktn の `.env` か、各クラウドのシークレットストアか）、有効期限と更新の手順 |
| 起動の条件 | どのブランチへのマージで起動するか。3クラウドで同じブランチにするか。リポジトリ内のどのディレクトリが変わったときだけ起動するか（例: `src/`・`Dockerfile`・`migrations/` の変更だけ。`docs/` の変更では起動しない） |
| リポジトリの場所 | GitHub のリポジトリ名・所有者（個人 / Organization）。cdktn の設定ファイルにどう書くか（3クラウドで共通の1か所にするか） |

### 12.3 論点2: 環境変数とシークレットの管理

値の種類ごとに、誰が作り、どこに置き、どう渡すかを決める。

| 値の種類 | 例 | 決める人・時期 | 検討すること |
|---|---|---|---|
| インフラが決める値（ビルド時） | ECR の URI、ECS クラスタ・サービス名、Artifact Registry 名、Cloud Run サービス名 | cdktn（deploy 時） | cdktn がビルドシステムの環境変数・置換変数として設定する（アプリのリポジトリに直書きしない）。名前を変えたときに自動で追従するか |
| インフラが決める値（実行時） | `DB_HOST`（プライベート DNS 名）、`DB_PORT`、`DB_NAME`、`CLOUD_ID`、`PORT` | cdktn | コンテナの環境変数として cdktn が設定するか、パラメータストアに置いてアプリが読むか |
| 秘密の値（実行時） | `DB_USER` / `DB_PASSWORD`、レプリケーション用ユーザー | 初期値は cdktn、以後はアプリ（§7） | 各クラウドのシークレットストア → コンテナへの渡し方（ECS の `secrets`、Cloud Run のシークレット参照、Container Apps の Key Vault 参照）。値を更新したときにコンテナへ反映される条件（再デプロイが必要か）。ローテーションの手順 |
| アプリの設定値 | `GRAPHIQL_ENABLED`、`DB_POOL_MAX`、`DB_SSLMODE` | アプリ | アプリのリポジトリで管理するか、cdktn の設定ファイルで管理するか |
| state に残る値 | シークレットの初期値 | — | Terraform の state に平文で残る（SEC-04）。初期値をダミーにして、本当の値はアプリ側で入れる案も検討する |

### 12.4 論点3: ライフサイクルの違いをどう埋めるか

インフラ（cdktn deploy）とアプリ（マージのたびにビルド・デプロイ）は、更新の頻度とタイミングが違う。

| 論点 | 起きること・検討すること |
|---|---|
| 初回の立ち上げ | インフラを作る時点では、アプリのイメージがまだない。cdktn は仮のイメージでコンテナを作り、最初のビルドで本物に置き換わる（§3）。仮のイメージのヘルスチェックが通るか、初回のビルドを自動で起動するか |
| 両方が同じ設定を触る | **ECS は `ignore_changes` で `task_definition` を無視しているため、cdktn でタスク定義（環境変数・CPU・メモリなど）を変えても反映されない**。CI/CD が登録するリビジョンは、そのとき動いているリビジョンを元にする（`buildspec.yml`）。Cloud Run / Container Apps でイメージを無視させた場合も同じ問題が起きる。どの項目をどちらが持つかの分担を決める |
| デプロイの順序 | DB のマイグレーションとアプリのデプロイの順序（マイグレーションを先にするか、後方互換を必須にするか）。3クラウドの DB はレプリケーションでつながっているため、テーブル定義の変更は全クラウドに同じ順で適用する必要がある |
| 3クラウドのバージョンのそろえ方 | 同じコミットを3クラウドでビルドするが、ビルドは別々に動く。一部のクラウドだけ失敗したときに、バージョンが混在してよいか。巻き戻しの手順 |
| インフラの変更とアプリ | cdktn でリソースを作り直したとき（名前の変更など）に、ビルドの設定・権限が追従するか。destroy 時にレジストリのイメージをどう扱うか |
| 監視 | ビルド・デプロイの失敗を通知するか（FEAT-03 の通知先を使えるか） |

**アプリ側で決定・実装済み（2026-10-17）**: 「デプロイの順序」と「3クラウドのバージョンのそろえ方」は、アプリのリポジトリの `docs/operations.md`「Releases」と `docs/ai/FEATURE-PLAN.md` §7 で決めた。環境ごとのブランチ（dev → `dev`、stg → `staging`、prod → `prod`、`config/cicd.ts`）、PR（マージコミット）による昇格、DB の更新（`migrate.sh`）をアプリより先に行う、マイグレーションは追加のみで新旧の版の混在を許容、巻き戻しは環境のブランチの revert。ビルドでテストを実行し、`/healthz` が版（コミット）を返し、`/readyz` はマイグレーションが未適用なら 503（トラフィックを切り替えない）。

### 12.5 検討の進め方（案）

1. 論点1: 接続方式と起動条件を決める（Terraform で作れる範囲と手作業の範囲を確認）。
2. 論点2: 値の種類ごとに置き場所と渡し方を決める（§7 の方針を具体化）。
3. 論点3: cdktn とアプリの分担（特に ECS のタスク定義）と、マイグレーションの順序を決める。
4. 決まった内容を §6・§7・§9 に反映し、cdktn 側の作業（§9 #2〜#4）の変更内容を提示する。

## 参考

- [Active Active in Postgres 16](https://www.crunchydata.com/blog/active-active-postgres-16)
- [Cloud SQL: Set up logical replication and decoding](https://docs.cloud.google.com/sql/docs/postgres/replication/configure-logical-replication)
- [Azure Database for PostgreSQL: Logical replication and logical decoding](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-logical)
- [ACR Tasks: multi-step task on source commit](https://docs.microsoft.com/azure/container-registry/container-registry-tutorial-multistep-task)
- [ACR Tasks: automate builds on commit](https://learn.microsoft.com/bg-BG/azure/container-registry/container-registry-tutorial-build-task)
