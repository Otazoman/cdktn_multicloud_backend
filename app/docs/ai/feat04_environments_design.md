# FEAT-04 環境（dev / stg / prod）の分離 設計

- 作成日: 2026-10-11
- ステータス: **段階1〜3 完了（2026-10-11）**。段階4（FEAT-01 #4 の CI/CD）は AWS・Google を実装済み、Azure は未実装。残課題は §7（2026-10-12 に再開）
- 関連: `docs/ai/vpn_refactor_plan.md`（課題一覧）、`docs/ai/feat01_active_active_design.md`（#4 CI/CD の起動条件を環境ごとに変える）

## 1. 目的

dev / stg / prod を**別々のクラウドアカウント**（AWS アカウント、Google Cloud プロジェクト、Azure サブスクリプション）に構築し、1 つのリポジトリ・1 つのブランチ（`main`）から、deploy 時に環境名を指定して切り替える。

## 2. 決定事項（ユーザー確認済み）

| 項目 | 決定 |
|---|---|
| 環境の分け方 | 環境ごとに別アカウント。deploy 時に環境名（`DEPLOY_ENV`）を指定する |
| 環境名 | `dev` / `stg` / `prod`（将来増やせること） |
| 設定の分け方 | 各設定ファイルの中で、環境で違う値だけ `byEnv({...})` で書く（ブランチでは分けない） |
| 認証情報・秘密の値 | リポジトリ直下の `.env.<環境名>` に、クラウドの認証情報と秘密の値（DB パスワード等、旧 `config/.env`）をまとめる。環境ごとに Docker のコンテナを分けて読み込む（1 コンテナ = 1 環境） |
| state | `state/<環境名>/terraform.tfstate`（Git 管理外。作業端末だけで管理） |
| VPN の方式 | `env: "dev" \| "prod"` を `vpnMode: "singleTunnel" \| "haBgp"` に改名し、環境ごとに設定できるようにする |
| ドキュメント | コード修正後に `architecture.md` 等も更新する。設定の説明ファイルを表形式で作る（§5 段階3） |

## 3. 仕組み

### 3.1 環境の選択（`config/environment.ts`）

```ts
export const ENVIRONMENTS = ["dev", "stg", "prod"] as const;  // 環境を増やすときはここに追加
export type EnvName = (typeof ENVIRONMENTS)[number];

// DEPLOY_ENV を読む。未指定・不明な値はエラー
export function currentEnv(): EnvName;

// 全環境を明示（抜けがあると型エラー）
byEnv({ dev: "t3.micro", stg: "t3.small", prod: "t3.medium" });
// 既定値 + 違う環境だけ（環境を増やしても書き換え不要）
byEnv({ default: "t3.micro", prod: "t3.medium" });

// 環境ごとに一意である必要がある名前: dev はそのまま、ほかは環境名を付ける
envScopedName("multicloud-kv-001");                    // stg → "multicloud-kv-001-stg"
envScopedName("stcatappdata001", { hyphen: false });  // stg → "stcatappdata001stg"
```

- `byEnv` は設定ファイルの読み込み時に評価される（今の設定ファイルは値を直接 export しているため）。
- 環境を増やすとき: `ENVIRONMENTS` に追加 → `.env.<環境名>` を作る → `default` のない `byEnv` に値を書く（型エラーで場所がわかる）。

### 3.2 認証情報・秘密の値（Docker）

```yaml
# compose.yaml
env_file:
  - .env.${DEPLOY_ENV:?...}
environment:
  DEPLOY_ENV: ${DEPLOY_ENV}
```

```bash
DEPLOY_ENV=dev docker compose -p cdktn-dev up -d
docker compose -p cdktn-dev exec cdktn-backend bash   # 中では今までどおり cdktn deploy
```

- `.env`（リポジトリ直下）にはツールのバージョン（ビルド引数）だけを残す。
- `config/.env` は使わない（`app.ts` の dotenv 読み込みを削除）。環境ごとの値が混ざるのを防ぐため。
- `.gitignore` に `.env.*`（`.env.sample` を除く）を追加する。
- `cdktf.out/` は全環境で共有するため、同時に 2 つの環境で synth / deploy しない。

### 3.3 state

`MultiCloudBackendStack` で `LocalBackend` の `path` を `state/<環境名>/terraform.tfstate` にする（既定の `terraform.app.tfstate` と同じく `process.cwd()` 基準）。既存の `terraform.app.tfstate` は、引き継ぐ環境のフォルダへ手で移す（手順は `docs/operations.md`）。

### 3.4 取り違え防止（provider）

| クラウド | 方法 |
|---|---|
| AWS | `allowedAccountIds`（`commonsettings.ts` の `accounts.awsAccountId` を設定したとき） |
| Azure | `subscriptionId`（`accounts.azureSubscriptionId` を設定したとき）。認証情報の `ARM_SUBSCRIPTION_ID` と違えば、設定のサブスクリプションに対して実行される（権限がなければエラー） |
| Google | provider の `project` = `config/google/common.ts` の `PROJECT_NAME`（環境ごと）。未設定の環境で Google を有効にするとエラー |

### 3.5 環境で違う値（段階1で byEnv / envScopedName にするもの）

| 種類 | 値 | dev | stg / prod |
|---|---|---|---|
| アカウント | AWS アカウント ID、Azure サブスクリプション ID | 未設定（任意） | 未設定（設定を推奨） |
| アカウント | Google Cloud プロジェクト ID（`PROJECT_NAME`） | 現在の値 | **未設定（要設定）** |
| VPN | `vpnMode` | `singleTunnel` | stg: `singleTunnel`、prod: `haBgp` |
| 一意な名前 | Key Vault、ACR、Azure DB サーバー、Azure Files のストレージアカウント | 現在の値 | `envScopedName`（環境名を付ける） |

- 既存の deploy を dev として引き継げるよう、**dev の値は現在の値と同じ**にする。
- サイズ・`build`・機能の ON/OFF は、仕組み（`byEnv`）だけ用意し、値は現在のまま（必要になった項目から `byEnv` にする）。
- 公開ドメイン: クラウドごとの `config/<cloud>/common.ts` の `PUBLIC_DOMAIN`（byEnv。既定値は現在の値）に 1 か所で書き、LB のホスト名・証明書・公開 DNS ゾーン名はそこから組み立てる（2026-10-11 実装。dev の合成結果は完全一致）。DNS を使わない場合（`features.dns` が false）は、公開ゾーンと A レコードは作られず、値は使われない（AWS のマネージド証明書は DNS 検証にゾーンが必要なため作られない。HTTP のパターンか証明書ファイルの取り込みを使う）。
- ログアーカイブのバケット / ストレージアカウント名（現在は未設定）は、使うときに byEnv で環境ごとに書く。

## 4. 変更するファイル（段階1）

| ファイル | 内容 |
|---|---|
| `config/environment.ts`（新規） | `ENVIRONMENTS`、`currentEnv`、`byEnv`、`envScopedName` |
| `config/commonsettings.ts` | `env` → `vpnMode`（byEnv）、`accounts`（byEnv） |
| `config/google/common.ts` | `PROJECT_NAME` を byEnv |
| `config/azure/secrets.ts`、`devops_acr_config.ts`、`azuredatabase/databases.ts`、`files.ts` | 一意な名前を `envScopedName` |
| `resources/vpnResources.ts`、`resources/vpn/*`（コメント） | `env === "dev"` → `vpnMode === "singleTunnel"` |
| `providers/providers.ts` | 取り違え防止（§3.4） |
| `stacks/MultiCloudBackendStack.ts` | `LocalBackend`（§3.3） |
| `app.ts` | `config/.env` の読み込みを削除 |
| `compose.yaml`、`.gitignore`（ルート・app）、`.env.sample` | §3.2 |
| `config/.env.sample` | 削除（内容は `.env.sample` へ） |
| `jest.config.js`、`__tests__/*`、`scripts/dev/*` | テストは `DEPLOY_ENV=dev` を既定に。`env` → `vpnMode`。`config/.env` の読み込みを削除 |
| `docs/getting-started.md`、`docs/operations.md`、`README.md` | 起動・deploy・移行手順（最低限。全体の更新は段階3） |

## 5. 段階

| 段階 | 内容 | 状態 |
|---|---|---|
| 0 | 本設計書、課題一覧に FEAT-04 を追加 | 完了 |
| 1 | 環境の仕組み（§3・§4） | 完了（2026-10-11）。合成結果は dev で全32パターン、`terraform.backend`（state の場所）以外は完全一致 |
| 2 | 設定の整理: PostgreSQL のみに絞る（**完了 2026-10-11**、設定ファイルのみ）。ALB 等の HTTP / HTTPS は既存の設定パターンを `build` で切り替える（変更なし）。そのほかの整理の範囲は相談しながら決める | 一部完了 |
| 3 | 設定の説明ファイル（`docs/configuration/` に共通 + クラウドごと、**英語**。表: Item \| Description \| Allowed values \| Default \| Notes）、`architecture.md` 等の更新 | **説明ファイルと文書更新は完了（2026-10-11）**。設定ファイルの整理: 決定済み（MySQL のサンプル値を修正、命名の書き方は変更せず `docs/configuration/README.md` に書き分けのルールを記載） |
| 4 | FEAT-01 #4（CI/CD）に戻る | AWS・Google は実装済み、Azure は未実装（2026-10-11）。§7 を参照 |

## 6. 未決事項

| # | 項目 | 選択肢 |
|---|---|---|
| 1 | ~~ALB 等の HTTP / HTTPS~~ | **決定**: 既存の設定パターンを `build` で切り替える |
| 2 | ~~PostgreSQL のみに絞る範囲~~ | **決定**: 設定ファイルのみ（完了） |
| 3 | ~~設定の説明ファイルと整理~~ | **決定・完了**: `docs/configuration/` に共通 + クラウドごと（英語と日本語 `.ja.md`）。整理は MySQL のサンプル値の修正のみ。RDS / Aurora のファイルは分けない。命名の書き方は統一せず README に書き分けのルールを記載 |
| 4 | ~~既存の deploy の扱い~~ | **決定**: dev として引き継ぐ（2026-10-11 時点で state は空） |
| 5 | stg / prod の値 | **保留（stg / prod の環境が決まってから）**。Google Cloud プロジェクト ID（`config/google/common.ts` の `PROJECT_NAME`）、AWS アカウント ID・Azure サブスクリプション ID（`config/commonsettings.ts` の `accounts`。`.env` から取らず設定ファイルに書く: 取り違え防止のため）、公開ドメイン（各クラウドの `common.ts` の `PUBLIC_DOMAIN`、実装済み）。ログアーカイブの名前は、アーカイブを有効にするときに各クラウドの監視の設定に byEnv で書く |

## 7. 残課題と再開時の作業（2026-10-11 時点。2026-10-12 に再開）

### 7.1 CI/CD（FEAT-01 #4）の状態

| クラウド | cdktn 側 | 事前の手作業（getting-started.md の「CI/CD: connect GitHub」） | 設定ファイルの値 |
|---|---|---|---|
| 共通 | `config/cicd.ts`（`appRepository` = `Otazoman/multipleclouds-api-app`、`cicdTrigger.branches` = byEnv、既定 `main`）、`utils/branchPattern.ts` | — | 済み |
| AWS | 実装済み: CodeConnections の接続を**名前から ARN を引く**（データソース `aws_codestarconnections_connection`。ARN はリポジトリに書かない: ユーザーの希望）、webhook（PUSH・HEAD_REF）、`deployTarget`（ECS サービス名）→ `ECS_CLUSTER` / `ECS_SERVICE` / `CONTAINER_NAME` とデプロイ権限（サービスロールへのインラインポリシー） | **完了**（接続 `multicloud-github`、承認済み） | `codebuild.codeConnectionName` = byEnv（既定 `multicloud-github`）。済み |
| Google | 実装済み: 第2世代のリポジトリ登録、専用サービスアカウント `cloudbuild-deployer` で動くトリガー（置換変数 `_REGION` / `_AR_REPOSITORY` / `_SERVICE` / `_WORKER_POOL`）、`deployTarget` の Cloud Run に `ignoreImageChanges` を自動で付ける | **完了**（接続 `multicloud-github`、`COMPLETE` を確認 2026-10-12） | `githubTrigger.connectionName` = `multicloud-github`。済み |
| Azure | **実装済み（2026-10-12、方式 (a)）**: Terraform の provider `microsoft/azuredevops@~> 1.16` を `cdktf.json` に追加し `cdktn get` で `.gen/` に生成（Git 管理外。`npm install` の後に `cdktn get`）。Managed DevOps Pool（Dev Center + プロジェクト、サブネット `devops-pool-subnet` 10.2.60.0/24、`Standard_D2ads_v5`、最大 1、待機 0）、エージェントの ID（AcrPush・Container App の Contributor）、パイプライン（`azuredevops` provider: GitHub 接続は名前から検索、変数 5 つ、プールと接続の利用許可、起動ブランチは `cicdTrigger`）、デプロイ先 `backend-api-service` に `ignoreImageChanges` と ACR から取得する専用 ID（AcrPull）。DevOpsInfrastructure の VNet の権限は `.env` の `AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID` があれば cdktn が付ける | **完了**: 組織 `otazoman-multicloud`、プロジェクト `multicloud-api`、サービス接続 `github.com_Otazoman`、cdktn のサービスプリンシパルを組織に追加（Users・Agent pools の Administrator・サービス接続の Administrator）。リソースプロバイダーの登録（2026-10-12 完了）、アプリに `azure-pipelines.yml` を追加し `acr-task.yaml` を削除（2026-10-12、未コミット）。**未**: DevOpsInfrastructure のオブジェクト ID を `.env.dev` に書く | `config/azure/cicd.ts`（組織・プロジェクト・接続名は既定値で設定済み） |

検証: 型チェック OK。今の設定（cicd 無効）の合成結果は変更前と完全一致。全機能を有効にした合成結果の差分は CI/CD のリソースのみ。jest は 182 件中 181 件成功。

### 7.2 再開時にやること（順番の案）

| # | 作業 | 必要なもの・決めること |
|---|---|---|
| 1 | ~~Google の接続の確認~~ | **完了**（2026-10-12、`COMPLETE`） |
| 2 | AWS・Google の CI/CD を dev に deploy（準備: 2026-10-12 に AWS の ALB を `build` で HTTP のパターン `plain-http-alb` に切り替え。HTTPS のリスナーに証明書がないと合成時に警告を出すようにした）: `commonsettings.ts` で aws / google の `features.cicd` と `features.containers` を `true` → `cdktn diff` → `cdktn deploy` | ユーザーの承認（インフラの変更・課金: CodeBuild / Cloud Build のプライベートプール / ECR / Artifact Registry、ALB・ECS・Cloud Run 等）。containers は deployTarget の ECS / Cloud Run に必要 |
| 3 | deploy 後の確認: webhook とトリガーが動くか（`main` への push）、Google のトリガーで `_WORKER_POOL` がプライベートプールを正しく指定するか、AWS の webhook が作れるか | アプリのリポジトリへの push |
| 4 | Azure の CI/CD（**実装済み 2026-10-12**。残りはオブジェクト ID の設定・deploy・確認）: Managed DevOps Pool（Dev Center + プロジェクト + `azurerm_managed_devops_pool`）、`azuredevops` provider でパイプライン（サービス接続は名前から検索）、Container Apps の `ignoreImageChanges` の接続、ACR へのアクセス権 | **依存の追加 `@cdktn/provider-azuredevops` の承認**。cdktn の実行 ID（サービスプリンシパル）を Azure DevOps の組織のメンバーにする必要（`use_cli` で作業者としてサインインする案もある。要相談）。アプリ側にパイプラインの YAML がない（今は ACR Tasks 用の `acr-task.yaml` のみ）→ アプリのリポジトリに追加が必要 |
| 5 | #5: API コンテナの設定。**ポートは 2026-10-12 に対応**（アプリは 8080: ECS `api-service` のポートと ALB のターゲットグループを 8080、`ecs-sg` に 8080 を追加、Container Apps `backend-api-service` の `targetPort` を 8080、仮のイメージを 8080 で待ち受ける `nginxinc/nginx-unprivileged:stable` に変更。Cloud Run は元から 8080。ヘルスチェックの `/` はアプリの liveness と一致）。**残り**: シークレットの受け渡し、DB 接続の環境変数、readiness（`/readyz`）を使うか | FEAT-01 §9 #5 |
| 6 | 起動条件の値を環境ごとに決める（`cicdTrigger.branches` の stg / prod） | ユーザーの判断。今は全環境 `main` |

### 7.3 そのほかの残課題

| 項目 | 内容 |
|---|---|
| テストの失敗 1 件 | `__tests__/logging.test.ts`の「Google: VPN and Cloud Run logs go to their buckets」。`config/google/cloudlogging.ts` に日付付きの `bucketId`（`vpn-log-202610111130` など）が設定され、テストは既定の名前を期待している。CI/CD の変更とは無関係。テストを設定に合わせるか、ユーザーの判断待ち |
| ドキュメント | 利用者向けは英語版と日本語版（`.ja.md`）の 2 本立て。変更するときは両方を直す。Azure の手順（getting-started の「Azure: Azure DevOps」）の手順 6 の途中の画面（New connection の後）はスクリーンショット未確認。stg / prod で行うときに確認して確定する |
| stg / prod | 環境が決まってから §6 #5 の値を入れる。CI/CD の接続（AWS・Google・Azure）も環境（アカウント）ごとに手作業で作る |

