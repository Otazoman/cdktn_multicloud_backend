# FEAT-01 アクティブ / アクティブ構成 設計方針

- 作成日: 2026-10-04（同日改訂: ユーザー決定を反映）
- ステータス: **方針確定・cdktn 側の作業とアプリのディレクトリの承認待ち（§9・§10）**
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
| シークレット・パラメータ | **初期値は cdktn で投入し、以後はアプリ側で更新する** |
| アプリ | **別リポジトリ**。API は **TypeScript + GraphQL** で CRUD |
| cdktn の範囲 | インフラを作るところまで |

## 3. 責任の分担

| 項目 | cdktn | アプリのリポジトリ |
|---|---|---|
| ネットワーク・VPN・DNS、DB 間の通信許可 | ○ | |
| DB インスタンスと論理レプリケーションのパラメータ | ○ | |
| コンテナの実行環境・レジストリ（初期イメージは仮のもの） | ○ | |
| CI/CD の受け皿（トリガー、権限、レジストリへのアクセス） | ○ | |
| シークレット・パラメータの**入れ物と初期値** | ○ | |
| シークレット・パラメータの**以後の値** | | ○ |
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

## 7. シークレット・パラメータ（初期値は cdktn、以後はアプリ）

cdktn が値を入れたまま管理すると、アプリ側で値を更新した後に `cdktn deploy` を実行したとき、Terraform が初期値に戻してしまう。

- **入れ物と初期値は cdktn で作り、値の変更は Terraform に無視させる**（`lifecycle.ignore_changes`）。

| クラウド | 置き場所 | cdktn で作るもの | 値の変更を無視する対象 |
|---|---|---|---|
| AWS | Secrets Manager / SSM Parameter Store | シークレット、初期バージョン / パラメータ | `secret_string` / `value` |
| Google | Secret Manager | シークレット、初期バージョン | （バージョンは追加式なので、アプリは新しいバージョンを追加する） |
| Azure | Key Vault（**新規**） | Key Vault、シークレット | `value` |

- 対象の例: DB の接続情報（API 用ユーザー・レプリケーション用ユーザーを分ける）、レプリケーションの接続先（各 DB のプライベート DNS 名）、API の設定値。
- 初期値は `config/.env` から読む。Terraform の state には初期値が残るため、state の扱いに注意する（SEC-04）。

## 8. ネットワーク・DB の前提

| 項目 | 現状 | 必要な対応 |
|---|---|---|
| 論理レプリケーションのパラメータ | 未設定 | RDS / Aurora: `rds.logical_replication=1`、Cloud SQL: `cloudsql.logical_decoding=on`、Azure: `wal_level=logical`。あわせて `max_replication_slots` / `max_wal_senders`（参加ノード数に応じて） |
| DB 間・VM から DB への通信（5432） | **許可済み**: AWS の DB 用 SG は Google（10.1.0.0/16）・Azure（10.2.0.0/16）から、Google は3クラウドの範囲から、Azure の PostgreSQL 用 NSG は `VirtualNetwork` タグ（VPN でつながった先の範囲を含む）から許可 | 変更なし（必要になれば、DB サブネット同士に絞る強化を別途検討） |
| Cloud SQL への経路 | PSA の範囲を Cloud Router が VPN へ広告済み | 変更なし |
| DB の接続名 | プライベート DNS に CNAME を登録する仕組みあり | レプリケーションと API の接続先に使う |
| 作業用 VM / コンテナジョブ | 各クラウドに VM あり。他クラウドの DB へ通信可能（上記） | シェルスクリプトで設定する場合は変更なし。コンテナジョブを使う場合は実行環境を追加 |
| 監視 | FEAT-03 で設計中 | レプリケーションの遅延・停止、スロットの WAL 蓄積を監視対象に加える |

## 9. cdktn 側の作業（案）

| # | 作業 | 主な変更箇所 | 合成結果 |
|---|---|---|---|
| 1 | 論理レプリケーションのパラメータを有効化（設定でON/OFF） | `config/aws/aurorards/*-parameters.ts`、`config/google/cloudsql/*`、`config/azure/azuredatabase/postgres-parameters.ts` | DB のパラメータが変わる（作成済みの DB は再起動が必要な場合あり） |
| 2 | Cloud Run / Container Apps で、CI/CD が更新するイメージを Terraform に無視させる（§6.1） | `constructs/container/googlecloudrun.ts`、`constructs/container/azureaca.ts` | 合成結果に `lifecycle.ignore_changes` が加わる |
| 3 | シークレット・パラメータの入れ物と初期値（`ignore_changes` 付き）。Azure は Key Vault を新規 | `config/<cloud>/secrets.ts`（新規）、`clouds/<cloud>/secrets.ts`（新規）、construct 追加 | リソース追加 |
| 4 | CI/CD の受け皿: AWS（webhook、デプロイ権限）、Google（トリガー・権限）、Azure（§6 の判断しだい） | `constructs/cicd/*`、`config/<cloud>/cicd*` | リソースの追加・変更 |
| 5 | API コンテナの設定（ポート、ヘルスチェックのパス、シークレットの受け渡し） | `config/aws/ecs.ts`、`config/google/cloudrun.ts`、`config/azure/containerapps.ts` | 設定しだい |
| 6 | （必要なら）レプリケーション設定用のコンテナジョブの実行環境 | 各クラウドのコンテナ construct | リソース追加 |

## 10. 決めていただきたいこと

| # | 項目 | 状態 |
|---|---|---|
| 1 | Azure の CI/CD | 推奨: ACR Tasks（GitHub のマージで起動可能）。ご判断待ち |
| 2 | AWS のデプロイ | **決定: CodeBuild + ECS ネイティブ Blue/Green** |
| 3 | 作業用 VM から他クラウドの DB への通信 | **許可済み（確認済み）** |
| 4 | 着手順 | 推奨: 1（DB パラメータ）・2（ignore_changes）→ 3（シークレット）→ 4（CI/CD）→ 5 |
| 5 | アプリのリポジトリ | **決定: アプリとインフラ（このリポジトリ）はリポジトリを分ける**。場所・名前・雛形を作るかはご判断待ち（§11） |

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
├ acr-task.yaml           Azure ACR Tasks（イメージのプッシュ → Container Apps 更新）
└ docs/
```

## 参考

- [Active Active in Postgres 16](https://www.crunchydata.com/blog/active-active-postgres-16)
- [Cloud SQL: Set up logical replication and decoding](https://docs.cloud.google.com/sql/docs/postgres/replication/configure-logical-replication)
- [Azure Database for PostgreSQL: Logical replication and logical decoding](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-logical)
- [ACR Tasks: multi-step task on source commit](https://docs.microsoft.com/azure/container-registry/container-registry-tutorial-multistep-task)
- [ACR Tasks: automate builds on commit](https://learn.microsoft.com/bg-BG/azure/container-registry/container-registry-tutorial-build-task)
