# はじめに（初回 deploy までの準備）

[English](getting-started.md)

最初の `cdktn deploy` までに必要な準備をまとめています。英語版（[getting-started.md](getting-started.md)）と同じ内容です。変更するときは両方を更新してください。

1. [前提](#1-前提)
2. [クラウドの認証情報](#2-クラウドの認証情報)
3. [アプリケーションの秘密の値](#3-アプリケーションの秘密の値)
4. [証明書と鍵](#4-証明書と鍵)
5. [クラウド側の準備](#5-クラウド側の準備)
6. [設定](#6-設定)
7. [初回の deploy](#7-初回の-deploy)

## 1. 前提

- Docker と Docker Compose（Ubuntu 24.04 上の Docker 28.5 / Compose 2.40 で確認済み）
- deploy 先の各クラウドのアカウント（AWS アカウント、Google Cloud プロジェクト、Azure サブスクリプション）

コマンドはすべて `cdktn-backend` コンテナの中で実行します。コンテナには Node.js、cdktn CLI、Terraform、OpenTofu が入っています（`Dockerfile` を参照）。

### 環境

環境（`dev`、`stg`、`prod`）ごとに、別々のクラウドのアカウントに構築します。**環境ごとにコンテナを 1 つ**起動します。`DEPLOY_ENV` で環境を選ぶと、そのコンテナには次のものが渡されます。

- その環境の認証情報と秘密の値（`.env.<環境名>`、2 章）
- 設定（設定ファイルの `byEnv`、6 章）
- state（`state/<環境名>/terraform.tfstate`）

`.env.<環境名>` は、その環境のコンテナを起動する**前に**用意します。コンテナは起動するときにだけ `.env.<環境名>` を読み込むためです。クラウド側の準備（5 章）で調べる値（Azure の CI/CD の DevOpsInfrastructure のオブジェクト ID など）も、ここに含めます。後から値を足した場合は、コンテナを起動し直します（`DEPLOY_ENV=<環境名> docker compose -p cdktn-<環境名> up -d`）。

```bash
cp .env.sample .env                        # ツールのバージョン（ビルド引数）
cp .env.ENV.sample .env.dev                # 値を書く（2 章、3 章、5 章）
DEPLOY_ENV=dev docker compose -p cdktn-dev up -d --build
docker compose -p cdktn-dev exec cdktn-backend bash   # 作業ディレクトリ: /app
npm install
cdktn get    # .gen/ を生成する（Azure DevOps の provider、cdktf.json）。cdktf.json を変えたら再実行
```

別の環境では、別のプロジェクト名を使います（例: `DEPLOY_ENV=prod docker compose -p cdktn-prod up -d`）。どのコンテナも `app/` を共有しているため、2 つの環境で同時に synth や deploy をしないでください（`cdktf.out/` が共有されています）。環境名の一覧は `config/environment.ts` の `ENVIRONMENTS` にあります。環境を増やすときは、そこに追加し、`.env.<環境名>` を作ります。

## 2. クラウドの認証情報

**リポジトリの直下**で `.env.ENV.sample` を `.env.<環境名>`（`.env.dev`、`.env.stg`、`.env.prod`）にコピーし、その環境のアカウントの値を書きます。これらのファイルは Git の管理外です。`compose.yaml` が `.env.<DEPLOY_ENV>` をコンテナに渡し、Terraform の provider は標準の環境変数を読みます。同じファイルに、アプリケーションの秘密の値（3 章）も書きます。

| 変数 | 内容 |
|---|---|
| `AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY` | AWS の IAM ユーザーの認証情報 |
| `ARM_SUBSCRIPTION_ID`、`ARM_CLIENT_ID`、`ARM_CLIENT_SECRET`、`ARM_TENANT_ID`、`ARM_ENVIRONMENT` | Azure のサービスプリンシパル |
| `GOOGLE_CLOUD_KEYFILE_JSON` | Google Cloud のサービスアカウントキーの、**コンテナ内での**パス。`compose.yaml` が、キーのあるホストのディレクトリをマウントします |
| `GOOGLE_CLOUD_PROJECT` | Google Cloud のプロジェクト ID |

イメージのビルドに使うツールのバージョン（`NODE_VERSION`、`TERRAFORM_VERSION`、`OPENTOFU_VERSION`）は、`.env`（`.env.sample` から作成）に残します。

リージョン、Azure のロケーション、Google Cloud のプロジェクトは、`config/aws/common.ts`、`config/azure/common.ts`、`config/google/common.ts` に書きます。Google Cloud のプロジェクト ID（`PROJECT_NAME`）は環境ごとに書きます。Google Cloud を有効にする環境では必須です。

ある環境の認証情報で別の環境を変更してしまわないように、各環境のアカウント ID を `config/commonsettings.ts` の `accounts` に書いてください。AWS の provider はほかのアカウントでの実行を拒否し（`allowed_account_ids`）、Azure の provider はそのサブスクリプションを使います。

## 3. アプリケーションの秘密の値

認証情報と同じ `.env.<環境名>` に書きます（2 章。`config/.env` はもう読まれません）。

| 変数 | 使われる場所 |
|---|---|
| `AWSDB_ROOT_USER`、`AWSDB_ROOT_PASSWORD` | RDS / Aurora の管理者 |
| `GOOGLEDB_ROOT_USER`、`GOOGLEDB_ROOT_PASSWORD` | Cloud SQL の管理者 |
| `AZUREDB_ROOT_USER`、`AZUREDB_ROOT_PASSWORD` | Azure Database の管理者 |
| `AZURE_APPGW_SSL_CERT_PASSWORD` | Application Gateway の PFX 証明書のパスワード（4 章） |
| `GOOGLE_AZURE_VPN_PRESHARED_KEY` | Google Cloud ↔ Azure の VPN トンネルの事前共有鍵 |
| `ECS_WORKER_POSTGRES_PASSWORD` | ECS の `worker-service` の環境変数 `POSTGRES_PASSWORD` |
| `AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID` | サービスプリンシパル「DevOpsInfrastructure」のオブジェクト ID（Azure の CI/CD、5 章「Azure」の手順 10）。秘密の値ではないが、テナントごとの値なので Git に入れない |

`.env.<環境名>` は Docker Compose が読みます。次の値は引用符で囲んでください。

- `$` を含む値: **シングルクォート**で囲みます。囲まないと `$...` が変数として展開され、値が途中で切れます。ダブルクォートでも展開されます。
- ` #` を含む値: 引用符で囲みます。囲まないと、行の残りがコメントとして扱われます。

## 4. 証明書と鍵

次のファイルは環境ごとに用意し、Git では管理しません。使う機能を deploy する前に置いてください。

| ファイル | 使われる場所 |
|---|---|
| `sslcerts/openssl/server.crt`、`sslcerts/openssl/server.key` | Google Cloud Load Balancing（証明書の取り込み） |
| `sslcerts/pfx/azureappgw_certificate.pfx` | Azure Application Gateway（HTTPS リスナー） |
| `pubkey/azurevmauthkey.pub` | Azure の VM の SSH 公開鍵 |

テスト用には、同梱の `sslcerts/openssl/openssl.cnf` で自己署名証明書を作れます。

```bash
cd sslcerts/openssl
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -config openssl.cnf -keyout server.key -out server.crt
openssl pkcs12 -export -inkey server.key -in server.crt \
  -out ../pfx/azureappgw_certificate.pfx   # AZURE_APPGW_SSL_CERT_PASSWORD を使う
```

Azure 用は、独自の証明書（独自のホスト名と鍵）にすることもできます。Application Gateway がこれまで受け付けた
PFX の形式で作る例：

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -subj "/CN=azuretest.example.com" \
  -addext "subjectAltName=DNS:azuretest.example.com" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth,clientAuth" \
  -keyout azure.key -out azure.crt
export AZPW='...'   # .env.<環境名> の AZURE_APPGW_SSL_CERT_PASSWORD
openssl pkcs12 -export -inkey azure.key -in azure.crt \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 \
  -passout env:AZPW -out ../pfx/azureappgw_certificate.pfx
rm azure.key azure.crt
```

このリポジトリは公開されています。鍵や PFX は絶対にコミットしないでください（`.gitignore` で除外しています）。
一度 push した鍵は、後から削除しても履歴に残るので、作り直す必要があります。

## 5. クラウド側の準備

### AWS

cdktn が使う IAM ユーザーに、有効にするリソースの権限に加えて、次の権限を付けます。

- **ECS**: ECS の権限と、Application Auto Scaling の権限

  ```json
  {
    "Effect": "Allow",
    "Action": "application-autoscaling:*",
    "Resource": "*"
  }
  ```

- **EFS**: `AmazonElasticFileSystemFullAccess`
- **CodeBuild / ECR**: `IAMFullAccess` と、次のポリシー

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "codebuild:CreateProject",
          "codebuild:DeleteProject",
          "codebuild:UpdateProject",
          "codebuild:BatchGetProjects",
          "codebuild:ListProjects",
          "codebuild:CreateWebhook",
          "codebuild:UpdateWebhook",
          "codebuild:DeleteWebhook"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "ecr:CreateRepository",
          "ecr:DeleteRepository",
          "ecr:DescribeRepositories",
          "ecr:PutLifecyclePolicy",
          "ecr:GetLifecyclePolicy",
          "ecr:DeleteLifecyclePolicy",
          "ecr:SetRepositoryPolicy"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "codeconnections:ListConnections",
          "codestar-connections:ListConnections"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "codeconnections:GetConnection",
          "codeconnections:GetConnectionToken",
          "codeconnections:ListTagsForResource",
          "codeconnections:PassConnection",
          "codeconnections:UseConnection",
          "codestar-connections:GetConnection",
          "codestar-connections:GetConnectionToken",
          "codestar-connections:PassConnection",
          "codestar-connections:UseConnection"
        ],
        "Resource": [
          "arn:aws:codeconnections:ap-northeast-1:*:connection/*",
          "arn:aws:codestar-connections:ap-northeast-1:*:connection/*"
        ]
      }
    ]
  }
  ```

  `codeconnections` の 2 つは、cdktn が GitHub の接続を名前（`codeConnectionName`）で探し、CodeBuild のプロジェクトと webhook に設定するための権限です。ないと、`cdktn diff` が `not authorized to perform: codeconnections:ListConnections` で失敗し、CodeBuild のプロジェクトの作成が `OAuthProviderException: User is not authorized to access connection` で失敗します（CodeBuild は呼び出し元の権限で接続のトークンを取得するため、`GetConnectionToken` が必要です）。`codestar-connections` は、同じサービスの旧名です。

### Google Cloud

使う機能の API を有効にします。

| 機能 | API |
|---|---|
| Cloud SQL | Cloud Resource Manager API、Cloud SQL Admin API、Service Networking API |
| Cloud Run | Cloud Run Admin API、IAM API、Artifact Registry API、Cloud Build API、Serverless VPC Access API、Cloud Filestore API |
| Filestore | Cloud Filestore API |
| Secret Manager（Cloud SQL と一緒に使う） | Secret Manager API |
| CI/CD | Cloud Build API、Secret Manager API（GitHub との接続）、Artifact Registry API、Cloud Run Admin API、IAM API、Service Networking API（プライベートプールがプライベート サービス アクセスを使うため） |

```bash
PROJECT=your-project-id
USER_EMAIL=you@example.com
SERVICE_ACCOUNT=your-sa@your-project-id.iam.gserviceaccount.com

gcloud config set project "$PROJECT"
gcloud services enable run.googleapis.com iam.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="user:${USER_EMAIL}" --role="roles/run.admin"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" --role="roles/run.admin"
```

Cloud SQL を使う場合、cdktn が使うサービスアカウントには **Network Administrator**（ネットワーク管理者）のロールが必要です（編集者のロールでは足りません）。

CI/CD では、cdktn がビルド用のサービスアカウント（`cloudbuild-deployer`）にロールを付けます。そのため、cdktn が使うサービスアカウントには、IAM ポリシーを変更する権限が必要です（編集者のロールにはありません）。プロジェクトの所有者として、次のロールを付けてください（ないと、deploy が `setIamPolicy ... denied` / `Policy update access denied` で失敗します）。

```bash
CDKTN_SA=<cdktn が使うサービスアカウントのメールアドレス>   # キーの client_email
for role in roles/resourcemanager.projectIamAdmin roles/artifactregistry.admin roles/iam.serviceAccountAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$CDKTN_SA" --role="$role" --condition=None
done
```

`roles/resourcemanager.projectIamAdmin` は、プロジェクトのどの IAM の設定も変更できる強い権限です。cdktn のサービスアカウントにだけ付けてください。`CDKTN_SA` は、`GOOGLE_CLOUD_KEYFILE_JSON` が指すキーのファイルの `client_email` です（App Engine の既定のサービスアカウント `<プロジェクト>@appspot.gserviceaccount.com` などと取り違えないでください）。付けた後、3 つのロールが表示されることを確認します。

```bash
gcloud projects get-iam-policy "$PROJECT" --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$CDKTN_SA" --format="value(bindings.role)"
```

反映まで数分かかることがあります。誤って別のアカウントに付けた場合は、そのアカウントから外してください（`gcloud projects remove-iam-policy-binding` に、同じ `--member`、`--role`、`--condition=None` を指定します）。

### Azure

- **Container Apps**: リソースプロバイダー `Microsoft.App` を登録します。

  ```bash
  az login
  az provider register --namespace Microsoft.App
  az provider show --namespace Microsoft.App --query registrationState
  ```

- **ロールの割り当て**: cdktn はロールの割り当てを作ります。そのため、cdktn を実行する ID（`ARM_CLIENT_ID`）には、ロールを割り当てる権限が必要です。サブスクリプション（またはリソースグループとその中のリソース）に対する**所有者**か**ユーザー アクセス管理者**を付けてください。使われる場面は次のとおりです。
  - Key Vault（Azure Database と一緒に作られます）: Key Vault に対する `Key Vault Secrets Officer`。
  - CI/CD: ACR に対する AcrPush とデプロイ先の Container Apps に対する共同作成者（ビルドのエージェント）、ACR に対する AcrPull（Container Apps）、VNet に対する閲覧者とネットワーク共同作成者（DevOpsInfrastructure）。

### 公開 DNS のサブドメインの委任

クラウドごとに、それぞれのサブドメイン（例: `awstest.example.com`）を持ちます。公開ゾーンを作った後、親ゾーンから委任します。

各サブドメインのネームサーバーを調べます。

```bash
# AWS（Route 53）
SUB_DOMAIN="awstest.example.com"
aws route53 list-hosted-zones-by-name --dns-name "$SUB_DOMAIN" \
  --query "HostedZones[0].Id" --output text \
  | xargs -I {} aws route53 get-hosted-zone --id {} \
      --query "DelegationSet.NameServers" --output text

# Google Cloud（Cloud DNS）- 末尾のドットに注意
SUB_DOMAIN="googletest.example.com."
gcloud dns managed-zones list --project="$PROJECT" \
  --filter="dnsName=$SUB_DOMAIN" --format="value(nameServers.list())"

# Azure DNS
SUB_DOMAIN="azuretest.example.com"
az network dns zone show -g "your-resource-group" -n "$SUB_DOMAIN" \
  --query "nameServers" -o tsv
```

親ゾーンに NS レコードとして登録します（例: Route 53）。

```bash
PARENT_ZONE_ID=your-parent-zone-id
SUB_DOMAIN="awstest.example.com"
SUB_NS="ns-1.example.net ns-2.example.org"   # 上で調べたネームサーバー

aws route53 change-resource-record-sets \
  --hosted-zone-id "$PARENT_ZONE_ID" \
  --change-batch "{
    \"Comment\": \"Update NS for $SUB_DOMAIN\",
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"$SUB_DOMAIN.\",
        \"Type\": \"NS\",
        \"TTL\": 60,
        \"ResourceRecords\": [
          $(for ns in $SUB_NS; do echo "{\"Value\": \"$ns\"},"; done | sed '$s/,$//')
        ]
      }
    }]
  }"
```

### CI/CD: GitHub との接続（初回の deploy の前に）

`features.cicd` を有効にすると、変更がマージされたときに、各クラウドがアプリのリポジトリをビルドします。GitHub との接続にはブラウザでの承認が必要で、Terraform ではできません。そのため、`cdktn deploy` の**前に**接続を作ります。cdktn は、その接続を名前で参照します。この作業は環境ごとに 1 回行います。以下でインストールする GitHub App は、どれもアプリのリポジトリだけを対象にします。

最初にシェルで名前を設定します（必要に応じて変えてください）。後で、同じ値を cdktn の設定ファイルに書きます。

```bash
# アプリのリポジトリ（プライベート）
GITHUB_OWNER=Otazoman
GITHUB_REPO=multipleclouds-api-app
# AWS
AWS_REGION=ap-northeast-1
AWS_CONNECTION_NAME=multicloud-github
# Google Cloud
GCP_PROJECT=multicloud-sitevpn-project
GCP_REGION=asia-northeast1
GCP_CONNECTION_NAME=multicloud-github
# Azure DevOps
ADO_ORG=otazoman-multicloud
ADO_PROJECT=multicloud-api
```

App をインストールするには、GitHub のリポジトリの管理者権限が必要です。

#### AWS: CodeConnections

1. 接続を作ります（作った直後は `PENDING` の状態です）。

   ```bash
   AWS_CONNECTION_ARN="$(aws codeconnections create-connection \
     --region "$AWS_REGION" --provider-type GitHub \
     --connection-name "$AWS_CONNECTION_NAME" \
     --query ConnectionArn --output text)"
   echo "$AWS_CONNECTION_ARN"
   ```

2. ブラウザで承認します（CLI ではこの手順を完了できません）。
   1. 同じリージョンの AWS コンソールで、**デベロッパー用ツール** → **設定** → **接続** を開き、作った接続を選びます。
   2. **保留中の接続を更新** を選びます。求められたら GitHub にサインインし、**AWS Connector for GitHub** を承認します。
   3. **新しいアプリをインストールする** を選び、アカウント `$GITHUB_OWNER` を選びます。**Only select repositories** → `$GITHUB_REPO` → **Install** を選びます。
   4. コンソールに戻り、**接続** を選びます。

3. 状態が `AVAILABLE` になったことを確認します。

   ```bash
   aws codeconnections get-connection --region "$AWS_REGION" \
     --connection-arn "$AWS_CONNECTION_ARN" \
     --query Connection.ConnectionStatus --output text
   ```

4. App がリポジトリを読めることを確認します。GitHub の **Settings** → **Applications** → **Installed GitHub Apps** → **AWS Connector for GitHub** → **Configure** の **Repository access** に `$GITHUB_REPO` が含まれていること。含まれていないと、CodeBuild のプロジェクトの作成が `OAuthProviderException` で失敗します。同じ画面で、App の権限の承認を求める表示（**Review request**）があれば承認します。承認していないと、webhook の作成が `OAuthProviderException: Failed to create webhook. GitHub API limit reached or permission issue` で失敗します（承認で解消することを確認済み）。
5. cdktn を実行する IAM ユーザーに、上の「AWS」の「CodeBuild / ECR」の `codeconnections` の権限（`GetConnectionToken` を含む）を付けます。

#### Google Cloud: Cloud Build の GitHub 接続（第 2 世代）

1. API を有効にします（有効にした直後は、次の手順が数分間失敗することがあります）。

   ```bash
   gcloud services enable cloudbuild.googleapis.com secretmanager.googleapis.com \
     --project="$GCP_PROJECT"
   ```

2. Cloud Build のサービスエージェントが、GitHub のトークンを Secret Manager に保存できるようにします（プロジェクトごとに 1 回）。

   ```bash
   GCP_PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT" --format='value(projectNumber)')"
   gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
     --member="serviceAccount:service-${GCP_PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com" \
     --role="roles/secretmanager.admin" --condition=None
   ```

   `--condition=None` を付けると、条件なしでロールを付与します。付けないと、プロジェクトに条件付きの権限があるときに、gcloud が条件の指定を求めます。そこで既存の条件（例: 期限切れの時間制限）を選ぶとロールが効かず、次の手順が `Permission 'secretmanager.secrets.create' denied` で失敗します。

3. 接続を作ります。コマンドがリンクを表示します。

   ```bash
   gcloud config set project "$GCP_PROJECT"
   gcloud builds connections create github "$GCP_CONNECTION_NAME" \
     --region="$GCP_REGION"
   ```

   成功すると、出力の最後に `PENDING_USER_OAUTH` とリンクが表示されます。手順 4 に進んでください（接続は**削除しないでください**）。

   **コマンドが失敗した場合だけ**（例: API を有効にした直後）、失敗した接続が残り、次の実行で「すでに存在する」と表示されることがあります。その場合は削除してから、作成のコマンドをもう一度実行します。

   ```bash
   gcloud builds connections delete "$GCP_CONNECTION_NAME" --region="$GCP_REGION"
   ```

4. GitHub にサインインしたブラウザでリンクを開き、**Cloud Build** の GitHub App を承認します（Cloud Build は、トークンをプロジェクトの Secret Manager に保存します）。メッセージはロボット用のアカウントを勧めますが、個人のアカウントのリポジトリなら、そのアカウントで問題ありません。
5. App をインストールします。アカウント `$GITHUB_OWNER` を選び、**Only select repositories** → `$GITHUB_REPO` → **Install** を選びます。
6. `installationState.stage` が `COMPLETE` になったことを確認します。

   ```bash
   gcloud builds connections describe "$GCP_CONNECTION_NAME" \
     --region="$GCP_REGION" --format="value(installationState.stage)"
   ```

   - `PENDING_USER_OAUTH`: 手順 4 がまだ終わっていません。
   - `PENDING_INSTALL_APP`: 承認は終わっていますが、App がリポジトリにインストールされていません。App がすでにアカウントにインストールされている場合は、GitHub の **Settings** → **Applications** → **Installed GitHub Apps** → **Google Cloud Build** の **Configure** を選びます。**Repository access** に `$GITHUB_REPO` を加えて、**Save** を選びます。その後、残りの手順のリンクを開いて、もう一度確認します。

     ```bash
     gcloud builds connections describe "$GCP_CONNECTION_NAME" \
       --region="$GCP_REGION" --format="value(installationState.actionUri)"
     ```

   最初からやり直す場合は、次の順で行い、手順 3 から繰り返します。
   1. 接続を削除します（手順 3 の削除のコマンド）。
   2. **Installed GitHub Apps** で **Google Cloud Build** をアンインストールします。
   3. **Authorized GitHub Apps** で **Google Cloud Build** を取り消します（Revoke）。

#### Azure: Azure DevOps の組織、プロジェクト、GitHub との接続

ここでの作業はすべてブラウザで行います。Azure DevOps は、同じメールアドレスを **2 つのアカウント**として扱います。個人の Microsoft アカウントと、Microsoft Entra のテナント（「既定のディレクトリ」）のメンバーです。組織は個人のアカウントで作り、その後テナントに接続します。接続した後は、テナントのメンバーとして組織を開きます。2 つのアカウントは、プロフィール（表示される名前や国が違うことがあります）も組織の一覧も別々です。

| 画面 | URL | 内容 |
|---|---|---|
| プロフィールと組織の一覧 | `https://aex.dev.azure.com` | プロフィール、**Microsoft account** とテナントを切り替えるドロップダウン、そのアカウントの組織の一覧。選んでいるアカウントの一覧に組織がないときは、必ず **Create new organization** が表示されます |
| 組織 | `https://dev.azure.com/$ADO_ORG` | 組織のプロジェクトの一覧と、**Organization settings**（左下） |
| プロジェクト | `https://dev.azure.com/$ADO_ORG/$ADO_PROJECT` | プロジェクトと、**Project settings**（左下。**Organization settings** とは別のページ） |

1. Azure ポータルで自分のアカウントを確認します。**Microsoft Entra ID** → **概要** にテナント（通常は「既定のディレクトリ」）が表示されます。**ユーザー** で、自分のアカウントの **ユーザーの種類** が **メンバー** であることを確認します（ゲストでは組織を接続できません）。
2. 組織を作ります。
   1. <https://aex.dev.azure.com> を開き（<https://dev.azure.com> からも移動します。Azure ポータルからは **Azure DevOps organizations** → **My Azure DevOps Organizations**）、Azure ポータルと**同じアカウント**でサインインします。プロフィールの画面が開き、名前の下のドロップダウンには **Microsoft account** と表示されます。
   2. **Create new organization** → **Continue**（利用規約）を選びます。
   3. 名前に `$ADO_ORG` を入れ、プロジェクトをホストする地域（例: East Asia）を選び、表示された文字を入力して **Continue** を選びます。

   Azure のサブスクリプションは不要です。サブスクリプションを紐付けるのは、有料の機能（並列ジョブの追加など）を使うときだけです（**Organization settings** → **Billing**）。
3. プロジェクトを作ります。次の画面は **Create a project to get started** です。Project name に `$ADO_PROJECT` を入れ、**Visibility** は **Private** のまま **Create project** を選びます。プロジェクトのトップページ（「Welcome to the project!」）が開きます。そこで操作することはありません。
4. 組織をテナントに接続します。
   1. 画面上部のパンくずリストで組織名（`$ADO_ORG`）を選び、左下の **Organization settings** → **Microsoft Entra** を開きます。**Connect directory** と表示されます（まだ接続していない状態）。
   2. **Connect directory** → 手順 1 のテナントを選び、**Connect** を選びます。組織の中身は消えません。
   3. 求められたら **Sign out** を選びます。
5. サインインし直し、テナントのメンバーとして組織を開きます。
   1. aex.dev.azure.com ではなく、`https://dev.azure.com/$ADO_ORG` を**直接**開き、同じメールアドレスでサインインします。アカウントの種類を聞かれたら、「職場または学校アカウント」を選びます。
   2. 組織の画面に、プロジェクト `$ADO_PROJECT` が表示されます。右上のイニシャルが前と違うことがありますが、テナントのメンバーのプロフィールだからです。
   3. **Organization settings** → **Microsoft Entra** に、テナント名が表示されていることを確認します。
   4. `https://dev.azure.com/$ADO_ORG` をブックマークします。<https://aex.dev.azure.com> の一覧は、**Microsoft account** とテナントのどちらを選んでも空のまま、**Create new organization** が表示されることがあります。**組織を作り直さず**、URL で開いてください。
6. プロジェクトから GitHub に接続します（手順 5 のとおり、テナントのメンバーとして開きます）。
   1. `https://dev.azure.com/$ADO_ORG/$ADO_PROJECT` → 左下の **Project settings** → **Boards** → **GitHub connections** を開きます。
   2. **New connection** → **GitHub** を選び、`$GITHUB_OWNER` で GitHub にサインインし、求められたら承認します。
   3. GitHub App のインストールを求められたら、**Only select repositories** → `$GITHUB_REPO` を選びます。Azure DevOps 側でも `$GITHUB_REPO` だけを選んで保存します。
   4. 一覧に、接続 `$GITHUB_OWNER`（認証方式 **GitHub App**、リポジトリ `$GITHUB_OWNER/$GITHUB_REPO`）が表示されます。

   GitHub の <https://github.com/apps/azure-pipelines> から始めないでください。そこから始めると **Setup your Azure Pipelines project** の画面が開きます。この画面は新しい組織を作るためのもので、テナントに接続した組織は選べません。この画面が開いた場合は、**Continue** を押さずに閉じてください。
7. パイプラインが使うサービス接続を確認します。同じ **Project settings** で、**Pipelines** → **Service connections** を開きます。
   - 名前が `github.com_$GITHUB_OWNER`（例: `github.com_Otazoman`）で、種類が **GitHub — using azure pipelines app** の接続があることを確認します。この名前を cdktn の設定に使います。ID は不要です（cdktn が名前から検索します）。
   - 手順 6 の **GitHub connections** の接続と、このサービス接続は別のものです。cdktn が使うのはサービス接続だけです。
   - サービス接続がない場合は、プロジェクトの左メニューの **Pipelines** → **Create Pipeline** → **GitHub** を選び、`$GITHUB_REPO` を選びます。App の承認を求められたら承認し、**Configure your pipeline** の画面は保存せずに閉じます（パイプラインは cdktn が作ります）。その後、もう一度確認します。

   CLI で確認する場合（`az login` でテナントのメンバーとしてサインインして）:

   ```bash
   az devops service-endpoint list --organization "https://dev.azure.com/$ADO_ORG" \
     --project "$ADO_PROJECT" \
     --query "[].{name:name, type:type, auth:authorization.scheme}" --output table
   ```

   GitHub App の接続は、種類が `GitHub`、認証方式が `InstallationToken` です。

8. cdktn を実行するサービスプリンシパルを、組織に追加します。ビルドのエージェントプール（Managed DevOps Pool）は作成時に組織に登録されるため、cdktn の ID（`.env.<環境名>` の `ARM_CLIENT_ID`）が、下の権限を持つメンバーである必要があります。`.env.<環境名>` は変更しません。
   1. ホストで表示名を調べます（コンテナには Azure CLI がありません。先に `az login` します）。`ARM_CLIENT_ID` の値は表示されません。

      ```bash
      cd <リポジトリの直下>
      ARM_CLIENT_ID="$(grep '^ARM_CLIENT_ID=' .env.<環境名> | cut -d= -f2- | tr -d "\"'")"
      az ad sp show --id "$ARM_CLIENT_ID" --query displayName --output tsv
      unset ARM_CLIENT_ID
      ```

      Azure ポータルで調べる場合は、**Microsoft Entra ID** → **アプリの登録** → **すべてのアプリケーション** で、**アプリケーション (クライアント) ID** が `ARM_CLIENT_ID` と同じものの表示名です。`az ad sp create-for-rbac` で作ったサービスプリンシパルの名前は `azure-cli-<日時>` です。分かりやすい名前（例: `cdktn-dev`）に変える場合は、追加する前にそこで変えます（ID は変わりません）。
   2. `https://dev.azure.com/$ADO_ORG` → **Organization settings** → **Users** → **Add users** を開き、**Users or Service Principals** に表示名、**Access level** に **Basic**、**Add to projects** に `$ADO_PROJECT`、**Azure DevOps Groups** に **Project Administrators** を指定して **Add** を選びます（メールの招待はサービスプリンシパルには関係ありません）。
   3. **Organization settings** → **Pipelines** → **Agent pools** → **Security** → **Add** で、サービスプリンシパルにロール **Administrator** を付けます。
   4. プロジェクト → **Project settings** → **Service connections** → `github.com_$GITHUB_OWNER` → **⋮** → **Security** → **User permissions**（**Project** タブ）→ **Add** で、サービスプリンシパルにロール **Administrator** を付けます（パイプラインにこの接続の利用を許可するために必要）。一覧に、Access が **Assigned** で表示されます。**Pipeline permissions**（「No permitted pipelines」）はそのままにします。パイプラインを作るときに許可されます。

   8.3 と 8.4 は、必要と見込まれる最小限の権限です。Azure の CI/CD の最初の deploy で権限が足りないと表示されたら、追加して、この手順書を更新してください。

9. ビルドのエージェントのリソースプロバイダーを登録します。**サブスクリプションごとに 1 回**、Azure の CI/CD を初めて deploy する前に行います。あなたのアカウントでサインインした Azure CLI（Azure ポータルの Cloud Shell（上部の `>_`）か、`az login` した端末）で実行します。

   ```bash
   az provider register --namespace Microsoft.DevOpsInfrastructure
   az provider register --namespace Microsoft.DevCenter
   ```

   コマンドはすぐに「Registering is still on-going」と表示して終わります。登録は通常数分（長いと 15 分ほど）かかります。2 つとも `Registered` になるまで待ちます。

   ```bash
   for ns in Microsoft.DevOpsInfrastructure Microsoft.DevCenter; do
     until [ "$(az provider show --namespace "$ns" --query registrationState -o tsv 2>/dev/null)" = "Registered" ]; do
       echo "$ns: waiting..."; sleep 30
     done
     echo "$ns: Registered"
   done
   ```

   Azure CLI 自身が出す `SyntaxWarning`（Python 3.14 の環境などで出ます）は無視してかまいません。30 分以上 `Registering` のままの場合は、ポータルで状態を確認してください。

   画面で行う場合は、**サブスクリプション** → 対象のサブスクリプション → **設定** → **リソース プロバイダー** → `Microsoft.DevOpsInfrastructure` を選び **登録** を選びます。`Microsoft.DevCenter` も同じように登録し、状態が **Registered** になるまで待ちます。
10. サービスプリンシパル **DevOpsInfrastructure** のオブジェクト ID を `.env.<環境名>` に書きます。**Microsoft Entra のテナントごとに 1 回**の作業です（このサービスプリンシパルと ID は変わらず、同じテナントの環境では同じ値を使います）。`.env.<環境名>` を用意するとき、つまりコンテナを起動する前（1 章）に行います。Managed DevOps Pool は、このサービスプリンシパルを通してエージェントを VNet に接続するため、VNet に対する閲覧者とネットワーク共同作成者の権限が必要です。この 2 つは、cdktn がプールを作る前に自動で割り当てます。
    1. 手順 9 の後に、次を実行します（`Microsoft.DevOpsInfrastructure` の登録でテナントに現れます。何も表示されない場合は、数分待ってからもう一度実行します）。

       ```bash
       az ad sp list --display-name DevOpsInfrastructure --query "[0].id" -o tsv
       ```

       画面で調べる場合は、**Microsoft Entra ID** → **エンタープライズ アプリケーション** → フィルター **アプリケーションの種類 == エンタープライズ アプリケーション** を外す → `DevOpsInfrastructure` を検索 → **オブジェクト ID** です。
    2. `.env.<環境名>` に `AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID=<オブジェクト ID>` を追加します。

    書かない場合は synth で警告が出て、2 つの権限を手作業で付けていない限り、プールの作成は失敗します。
11. アプリのリポジトリに `azure-pipelines.yml`（ビルド、ACR への push、`az containerapp update`）を追加します。パイプライン、その変数と利用許可は cdktn が作ります。パイプラインは `cicdTrigger.branches` への push で起動します。

#### cdktn の設定ファイルに値を書く

| 値 | ファイル | 項目 |
|---|---|---|
| `$GITHUB_OWNER`、`$GITHUB_REPO` | `config/cicd.ts` | `appRepository`（全クラウドで共通） |
| ビルドを起動するブランチ | `config/cicd.ts` | `cicdTrigger.branches`（`byEnv`。dev `dev`、stg `staging`、prod `prod`） |
| `$AWS_CONNECTION_NAME` | `config/aws/cicd/cicdsettings.ts` | `codebuild.codeConnectionName`（`byEnv`。既定は `multicloud-github`）。ARN は plan のときに名前から引きます |
| `$GCP_CONNECTION_NAME` | `config/google/cicdsettings.ts` | `githubTrigger.connectionName`（接続は `cloudbuildPrivatePool.location` のリージョン、つまり `$GCP_REGION` に作ります） |
| `$ADO_ORG`、`$ADO_PROJECT`、手順 7 のサービス接続の名前（`github.com_$GITHUB_OWNER`） | `config/azure/cicd.ts` | `organization`、`project`、`githubServiceConnectionName`（`byEnv`）。手順 8 のサービスプリンシパルは設定ファイルへの記載不要（cdktn は `ARM_CLIENT_ID` / `ARM_CLIENT_SECRET` / `ARM_TENANT_ID` でサインインする） |
| 手順 10 のオブジェクト ID | `.env.<環境名>` | `AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID` |

`codeConnectionName` を空にすると、synth が警告を表示し、CodeBuild のプロジェクトは webhook なしで作られます（プライベートのリポジトリを読めません）。

## 6. 設定

すべての設定項目は [configuration/](configuration/README.md)（共通、AWS、Google Cloud、Azure。英語）で説明しています。

環境ごとに違う値は、その値を書く場所で `byEnv()`（`config/environment.ts`）を使って書きます。例:

```ts
instanceType: byEnv({ dev: "t3.micro", stg: "t3.small", prod: "t3.medium" }),
build: byEnv({ default: false, stg: true }),   // 既定値 + 違う環境だけ
```

すべての環境で一意である必要がある名前（Key Vault、ACR、Azure Database のサーバー、ストレージアカウント）は、`envScopedName()` を使います。`dev` は名前をそのまま使い、ほかの環境では環境名を付けます。

全体の切り替えは `config/commonsettings.ts` にあります。

| 設定 | 内容 |
|---|---|
| `accounts` | 環境ごとのアカウント ID（2 章） |
| `vpnMode` | `"singleTunnel"`: トンネル 1 本の VPN と静的ルート。`"haBgp"`: BGP を使う HA VPN。既定値: `dev`・`stg` は `singleTunnel`、`prod` は `haBgp` |
| `useVpn` | VPN のリソースを作るかどうか |
| `awsToGoogle`、`awsToAzure`、`googleToAzure` | 2 つのクラウドを **直接** VPN でつなぎます。2 つを有効にすると（例: AWS–Azure と Google–Azure）、共通のクラウドがハブになり、残りの 2 つの間を BGP で中継します（`haBgp` のみ） |
| `hostZones` | プライベート DNS ゾーンと、クラウド間の DNS 転送を作ります |
| `clouds.<cloud>.enabled` | そのクラウドのネットワークと、その上のすべてを作ります（`<cloud>`: `aws`、`google`、`azure`） |
| `clouds.<cloud>.features` | クラウドごとの機能: `vms`、`dbs`（マネージド DB）、`storage`（ファイルストレージ）、`containers`（マネージドコンテナとそのロードバランサー）、`cicd`、`dns`（公開 DNS ゾーンとレコード）、`alerting`（通知先とアラーム）、`logArchive`（コンテナのログをオブジェクトストレージに保管） |

`haBgp` で使う、VPN のペアごとの BGP の内側のアドレス（APIPA）は `config/vpn/addressPlan.ts` に書きます。`npx jest __tests__/addressPlan.test.ts` で確認できます。ASN はクラウドごとに `config/<cloud>/vpn.ts` に書きます。

機能は VPN の接続に依存しません。クラウドと機能が有効なら、`useVpn = false` でも作られます。

クラウドごとの設定（ネットワーク、VM のサイズ、DB エンジン、コンテナイメージ、ロードバランサー、VPN のパラメータなど）は、`config/aws/`、`config/azure/`、`config/google/` にあります。

### リソースの名前

すべてのリソースの名前（Application Gateway のリスナーや IP 構成などのサブリソースも含む）は、そのリソースを作る機能の設定ファイルに書きます（例: VPN の名前は `config/<cloud>/vpn.ts`、サブネットの名前は `config/<cloud>/vpc*/subnets.ts`）。

- 項目の `name` がほかの設定から参照される論理名の場合、クラウド上の実際の名前は別に書きます（`resourceName`、またはその項目のために作るリソースの `names`）。
- 名前を省略すると、既定の名前 `<PROJECT_NAME>-<cloud>-<リソースの種類>[-<key>]` が作られます。名前は、リソースの命名規則（使える文字、最大の長さ）に合わせて調整されます。`PROJECT_NAME` は `config/naming.ts` にあります。
- クラウド側で決まっている名前（例: Azure の `GatewaySubnet`、`AzureBastionSubnet`、`privatelink.file.core.windows.net`）は変えられません。

名前を変えると、通常はクラウド側でリソースが作り直されます。名前を変えたときは、deploy の前に `cdktn diff` を確認してください。

ほとんどの項目の Terraform のアドレス（construct ID）は、項目の名前から作られます。名前を変えても Terraform に新しいリソースとして扱わせたくない場合は、`key` に以前の名前を書きます（例: `key: "old-name"`）。Azure Files の共有は `shareKey`、Container Apps の環境は `environmentKey` を使います。

## 7. 初回の deploy

その環境のコンテナ（1 章）の中で実行します。

最初の deploy の前に、有効にした機能の準備ができているかを確認します。

| 機能 | 確認すること |
|---|---|
| すべて | `.env.<環境名>` を、コンテナを起動する前に用意したこと（1 章）。コンテナの中で `npm install` と `cdktn get` を実行したこと |
| AWS の CI/CD | CodeConnections の接続が `AVAILABLE`、GitHub App の対象にリポジトリがある、IAM ユーザーに `codebuild` / `ecr` / `codeconnections` の権限がある（5 章「AWS」） |
| Google の CI/CD | API を有効にした（Service Networking を含む）、GitHub の接続が `COMPLETE`、cdktn のサービスアカウントに 3 つの IAM のロールがある（5 章「Google Cloud」） |
| Azure の CI/CD | 「Azure: Azure DevOps ...」の手順 1〜10（組織、プロジェクト、GitHub のサービス接続、組織へのサービスプリンシパルの追加、リソースプロバイダー、`AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID`）、ロールを割り当てる権限（5 章「Azure」）、アプリのリポジトリの `azure-pipelines.yml` |
| AWS の HTTPS のロードバランサー | 証明書があること（AWS マネージド証明書なら `features.dns`、または証明書ファイル（`IMPORT`））。ない場合は HTTP のパターンを使う（synth で警告が出る） |

```bash
echo "$DEPLOY_ENV"      # このコンテナの環境
npx tsc --noEmit -p .   # 型チェック
cdktn diff              # plan を確認する
cdktn deploy
```

deploy が権限のエラー（`AccessDenied`、`not authorized`、`403`、`setIamPolicy ... denied`）で止まった場合は、メッセージに出ている権限を付けて、もう一度 `cdktn deploy` を実行します。作成済みのリソースは state に記録されているので、二重には作られません。足りなかった権限は、この手順書に追記してください。

state は `state/<環境名>/terraform.tfstate` に書き込まれます（Git の管理外。作業端末で管理してください）。

削除の手順と既知の問題は [operations.md](operations.md) を参照してください。
