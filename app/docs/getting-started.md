# Getting started

[日本語](getting-started.ja.md)

This guide covers everything needed before the first `cdktn deploy`.

1. [Prerequisites](#1-prerequisites)
2. [Cloud credentials](#2-cloud-credentials)
3. [Application secrets](#3-application-secrets)
4. [Certificates and keys](#4-certificates-and-keys)
5. [Cloud-side preparation](#5-cloud-side-preparation)
6. [Configuration](#6-configuration)
7. [First deploy](#7-first-deploy)

## 1. Prerequisites

- Docker and Docker Compose (tested with Docker 28.5 / Compose 2.40 on Ubuntu 24.04)
- An account for each cloud you deploy to (AWS, Google Cloud project, Azure subscription)

All commands run inside the `cdktn-backend` container, which provides Node.js,
the cdktn CLI, Terraform and OpenTofu (see `Dockerfile`).

### Environments

Each environment (`dev`, `stg`, `prod`) is deployed to its own cloud accounts.
Run **one container per environment**: `DEPLOY_ENV` selects the environment,
and the container gets that environment's credentials and secrets
(`.env.<env>`, section 2), settings (`byEnv` in the config files, section 6)
and state (`state/<env>/terraform.tfstate`).

Prepare `.env.<env>` **before** starting the container of the environment:
the container reads it only when it starts. This includes the values found
during the cloud-side preparation (section 5), such as the DevOpsInfrastructure
object ID for the Azure CI/CD. If you add a value later, restart the container
(`DEPLOY_ENV=<env> docker compose -p cdktn-<env> up -d`).

```bash
cp .env.sample .env                        # tool versions (build arguments)
cp .env.ENV.sample .env.dev                # fill in (sections 2, 3 and 5)
DEPLOY_ENV=dev docker compose -p cdktn-dev up -d --build
docker compose -p cdktn-dev exec cdktn-backend bash   # working directory: /app
npm install
cdktn get    # generates .gen/ (Azure DevOps provider, cdktf.json); again after changing it
```

For another environment use its own project name, for example
`DEPLOY_ENV=prod docker compose -p cdktn-prod up -d`. All containers share
`app/`, so do not synthesize or deploy two environments at the same time
(`cdktf.out/` is shared). The environment names are listed in
`config/environment.ts` (`ENVIRONMENTS`); to add one, add it there and create
its `.env.<env>`.

## 2. Cloud credentials

Copy `.env.ENV.sample` to `.env.<env>` (`.env.dev`, `.env.stg`, `.env.prod`) in
the **repository root** and fill in the values of that environment's accounts.
These files are ignored by Git. `compose.yaml` passes `.env.<DEPLOY_ENV>` to the
container; the Terraform providers read the standard environment variables.
The same file holds the application secrets (section 3).

| Variable | Description |
|---|---|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | AWS IAM user credentials |
| `ARM_SUBSCRIPTION_ID`, `ARM_CLIENT_ID`, `ARM_CLIENT_SECRET`, `ARM_TENANT_ID`, `ARM_ENVIRONMENT` | Azure service principal |
| `GOOGLE_CLOUD_KEYFILE_JSON` | Path **inside the container** to the Google Cloud service account key. `compose.yaml` mounts the host directory that contains the key |
| `GOOGLE_CLOUD_PROJECT` | Google Cloud project ID |

The tool versions used to build the image (`NODE_VERSION`,
`TERRAFORM_VERSION`, `OPENTOFU_VERSION`) stay in `.env` (from `.env.sample`).

Regions, the Azure location and the Google Cloud project are set in
`config/aws/common.ts`, `config/azure/common.ts` and `config/google/common.ts`.
The Google Cloud project ID (`PROJECT_NAME`) is set per environment and is
required for every environment where Google Cloud is enabled.

To stop the credentials of one environment from changing another, set the
account IDs of each environment in `accounts` (`config/commonsettings.ts`):
the AWS provider then refuses other accounts (`allowed_account_ids`) and the
Azure provider uses that subscription.

## 3. Application secrets

Set these values in the same `.env.<env>` file as the credentials (section 2;
`config/.env` is no longer read).

| Variable | Used by |
|---|---|
| `AWSDB_ROOT_USER`, `AWSDB_ROOT_PASSWORD` | RDS / Aurora administrator |
| `GOOGLEDB_ROOT_USER`, `GOOGLEDB_ROOT_PASSWORD` | Cloud SQL administrator |
| `AZUREDB_ROOT_USER`, `AZUREDB_ROOT_PASSWORD` | Azure Database administrator |
| `AZURE_APPGW_SSL_CERT_PASSWORD` | Password of the Application Gateway PFX certificate (section 4) |
| `GOOGLE_AZURE_VPN_PRESHARED_KEY` | Pre-shared key of the Google Cloud ↔ Azure VPN tunnels |
| `ECS_WORKER_POSTGRES_PASSWORD` | `POSTGRES_PASSWORD` environment variable of the ECS `worker-service` |
| `AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID` | Object ID of the "DevOpsInfrastructure" service principal (Azure CI/CD, section 5 "Azure", step 10). Not secret, but tenant-specific and kept out of Git |
| `AZURE_KEYVAULT_SECRETS_OFFICER_IDS` | Object IDs (comma-separated) of the users who set the database secrets in the Azure Key Vault from the Azure VM: `az ad signed-in-user show --query id -o tsv`. Without it, `az keyvault secret set` fails with `ForbiddenByRbac`. Not secret, but tenant-specific and kept out of Git |

Docker Compose reads `.env.<env>`: wrap values that contain `$` in **single**
quotes (otherwise `$...` is expanded as a variable and the value is cut off,
even inside double quotes), and values that contain ` #` in quotes (otherwise
the rest of the line is treated as a comment).

## 4. Certificates and keys

These files are environment-specific and ignored by git. Place them before
deploying the features that use them.

| File | Used by |
|---|---|
| `sslcerts/openssl/server.crt`, `sslcerts/openssl/server.key` | Google Cloud Load Balancing (imported certificate) |
| `sslcerts/pfx/azureappgw_certificate.pfx` | Azure Application Gateway (HTTPS listener) |
| `pubkey/azurevmauthkey.pub` | SSH public key for Azure VMs |

For testing, a self-signed certificate can be created with the bundled
`sslcerts/openssl/openssl.cnf`:

```bash
cd sslcerts/openssl
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -config openssl.cnf -keyout server.key -out server.crt
openssl pkcs12 -export -inkey server.key -in server.crt \
  -out ../pfx/azureappgw_certificate.pfx   # use AZURE_APPGW_SSL_CERT_PASSWORD
```

The Azure certificate may instead be one of its own (its own host name and
key), in the PFX format the Application Gateway has accepted so far:

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -subj "/CN=azuretest.example.com" \
  -addext "subjectAltName=DNS:azuretest.example.com" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth,clientAuth" \
  -keyout azure.key -out azure.crt
export AZPW='...'   # AZURE_APPGW_SSL_CERT_PASSWORD of .env.<env>
openssl pkcs12 -export -inkey azure.key -in azure.crt \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 \
  -passout env:AZPW -out ../pfx/azureappgw_certificate.pfx
rm azure.key azure.crt
```

This repository is public: never commit keys or PFX files (`.gitignore`
excludes them). A key that was pushed once must be replaced: removing it
later does not remove it from the history.

## 5. Cloud-side preparation

### AWS

Grant the IAM user used by cdktn the following, in addition to the permissions
for the resources you enable:

- **ECS**: ECS permissions, and Application Auto Scaling:

  ```json
  {
    "Effect": "Allow",
    "Action": "application-autoscaling:*",
    "Resource": "*"
  }
  ```

- **EFS**: `AmazonElasticFileSystemFullAccess`
- **CodeBuild / ECR**: `IAMFullAccess` and the following policy:

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

  The `codeconnections` statements let cdktn look up the GitHub connection
  by name (`codeConnectionName`) and attach it to the CodeBuild project and
  its webhook. Without them `cdktn diff` fails with `not authorized to
  perform: codeconnections:ListConnections`, and creating the CodeBuild
  project fails with `OAuthProviderException: User is not authorized to
  access connection` (CodeBuild gets the connection token with the caller's
  permissions: `GetConnectionToken`). The `codestar-connections` actions are
  the older name of the same service.

### Google Cloud

Enable the APIs for the features you use:

| Feature | APIs |
|---|---|
| Cloud SQL | Cloud Resource Manager API, Cloud SQL Admin API, Service Networking API |
| Cloud Run | Cloud Run Admin API, IAM API, Artifact Registry API, Cloud Build API, Serverless VPC Access API, Cloud Filestore API |
| Filestore | Cloud Filestore API |
| Secret Manager (with Cloud SQL) | Secret Manager API |
| CI/CD | Cloud Build API, Secret Manager API (GitHub connection), Artifact Registry API, Cloud Run Admin API, IAM API, Service Networking API (the private pool uses Private Service Access) |

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

The service account used by cdktn needs the **Network Administrator** role for
Cloud SQL (the Editor role is not sufficient).

For CI/CD, cdktn grants roles to the build service account
(`cloudbuild-deployer`), and for the API it lets the Cloud Run runtime
service account read the database password secret
(`config/apicontainer.ts`). Both need permission to change IAM policies (the
Editor role cannot). Grant the service account used by cdktn these roles, as
the project owner (without them the deploy fails with
`setIamPolicy ... denied` / `Policy update access denied` /
`Permission 'secretmanager.secrets.setIamPolicy' denied`):

```bash
CDKTN_SA=<email of the service account used by cdktn>   # client_email of its key
for role in roles/resourcemanager.projectIamAdmin roles/artifactregistry.admin roles/iam.serviceAccountAdmin \
            roles/secretmanager.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$CDKTN_SA" --role="$role" --condition=None
done
```

`roles/resourcemanager.projectIamAdmin` can change any IAM binding of the
project; grant it only to the cdktn service account. Make sure `CDKTN_SA` is
the `client_email` of the key file that `GOOGLE_CLOUD_KEYFILE_JSON` points to
(not, for example, the App Engine default service account
`<project>@appspot.gserviceaccount.com`), and check the result — the four
roles must be listed:

```bash
gcloud projects get-iam-policy "$PROJECT" --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$CDKTN_SA" --format="value(bindings.role)"
```

A change can take a few minutes to take effect. If the roles were granted to
another account by mistake, remove them there (`gcloud projects
remove-iam-policy-binding` with the same `--member`, `--role` and
`--condition=None`).

### Azure

- **Container Apps**: register the `Microsoft.App` resource provider.

  ```bash
  az login
  az provider register --namespace Microsoft.App
  az provider show --namespace Microsoft.App --query registrationState
  ```

- **Role assignments**: cdktn creates role assignments, so the identity that
  runs cdktn (`ARM_CLIENT_ID`) needs permission to create them: **Owner** or
  **User Access Administrator** on the subscription (or on the resource
  group and the resources it contains). They are used by:
  - Key Vault (created with Azure Database): `Key Vault Secrets Officer` on
    the vault.
  - CI/CD: AcrPush on the ACR and Contributor on the target Container App
    (build agents), AcrPull on the ACR (the Container App), Reader and
    Network Contributor on the VNet (DevOpsInfrastructure).

### Public DNS sub-domain delegation

Each cloud hosts its own sub-domain (e.g. `awstest.example.com`). After the
public zones are created, delegate them from the parent zone.

Get the name servers of each sub-domain:

```bash
# AWS (Route 53)
SUB_DOMAIN="awstest.example.com"
aws route53 list-hosted-zones-by-name --dns-name "$SUB_DOMAIN" \
  --query "HostedZones[0].Id" --output text \
  | xargs -I {} aws route53 get-hosted-zone --id {} \
      --query "DelegationSet.NameServers" --output text

# Google Cloud (Cloud DNS) - note the trailing dot
SUB_DOMAIN="googletest.example.com."
gcloud dns managed-zones list --project="$PROJECT" \
  --filter="dnsName=$SUB_DOMAIN" --format="value(nameServers.list())"

# Azure DNS
SUB_DOMAIN="azuretest.example.com"
az network dns zone show -g "your-resource-group" -n "$SUB_DOMAIN" \
  --query "nameServers" -o tsv
```

Register them as an NS record in the parent zone (example: Route 53):

```bash
PARENT_ZONE_ID=your-parent-zone-id
SUB_DOMAIN="awstest.example.com"
SUB_NS="ns-1.example.net ns-2.example.org"   # name servers from above

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

### CI/CD: connect GitHub (before the first deploy)

With `features.cicd`, each cloud builds the application repository when a
change is merged. The connections to GitHub need approval in a browser, which
Terraform cannot do, so create them **before** `cdktn deploy`; cdktn then
references them by name. Do this once per environment. Every GitHub App
installation below is limited to the application repository only.

Set the names once in your shell (change them as needed) and write the same
values to the cdktn config files afterwards:

```bash
# Application repository (private)
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

You need admin permission on the GitHub repository to install the apps.

#### AWS: CodeConnections

1. Create the connection (it starts in the `PENDING` state):

   ```bash
   AWS_CONNECTION_ARN="$(aws codeconnections create-connection \
     --region "$AWS_REGION" --provider-type GitHub \
     --connection-name "$AWS_CONNECTION_NAME" \
     --query ConnectionArn --output text)"
   echo "$AWS_CONNECTION_ARN"
   ```

2. Approve it in the browser (the CLI cannot complete this step):
   1. Open the AWS console in the same region, **Developer Tools** →
      **Settings** → **Connections**, and select the connection.
   2. Choose **Update pending connection**. Sign in to GitHub and authorize
      **AWS Connector for GitHub** if asked.
   3. Choose **Install a new app**, select the account `$GITHUB_OWNER`, then
      **Only select repositories** → `$GITHUB_REPO` → **Install**.
   4. Back in the console, choose **Connect**.

3. Check that the status is `AVAILABLE`:

   ```bash
   aws codeconnections get-connection --region "$AWS_REGION" \
     --connection-arn "$AWS_CONNECTION_ARN" \
     --query Connection.ConnectionStatus --output text
   ```

4. Check that the app can read the repository: GitHub **Settings** →
   **Applications** → **Installed GitHub Apps** → **AWS Connector for
   GitHub** → **Configure** → **Repository access** includes `$GITHUB_REPO`.
   Otherwise creating the CodeBuild project fails with `OAuthProviderException`.
   On the same page, accept the pending permission request of the app
   (**Review request**) if it is shown. Without it, creating the webhook
   fails with `OAuthProviderException: Failed to create webhook. GitHub API
   limit reached or permission issue` (confirmed: accepting the request
   fixed it).
5. Give the IAM user that runs cdktn the `codeconnections` permissions of
   "CodeBuild / ECR" in the AWS section above (including
   `GetConnectionToken`).

#### Google Cloud: Cloud Build GitHub connection (2nd gen)

1. Enable the APIs (a newly enabled API can take a few minutes before the
   next steps succeed):

   ```bash
   gcloud services enable cloudbuild.googleapis.com secretmanager.googleapis.com \
     --project="$GCP_PROJECT"
   ```

2. Allow the Cloud Build service agent to store the GitHub token in Secret
   Manager (once per project):

   ```bash
   GCP_PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT" --format='value(projectNumber)')"
   gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
     --member="serviceAccount:service-${GCP_PROJECT_NUMBER}@gcp-sa-cloudbuild.iam.gserviceaccount.com" \
     --role="roles/secretmanager.admin" --condition=None
   ```

   `--condition=None` adds the role without a condition. Without it, gcloud
   asks for a condition when the project already has conditional bindings;
   choosing an existing condition (for example an expired time limit) makes
   the role ineffective and the next step fails with
   `Permission 'secretmanager.secrets.create' denied`.

3. Create the connection; the command prints a link:

   ```bash
   gcloud config set project "$GCP_PROJECT"
   gcloud builds connections create github "$GCP_CONNECTION_NAME" \
     --region="$GCP_REGION"
   ```

   On success the output ends with `PENDING_USER_OAUTH` and a link: go on
   with step 4 (do **not** delete the connection).

   **Only if the command fails** (for example because an API was enabled only
   a moment ago), a failed connection may remain and the next attempt reports
   that it already exists. Delete it and run the create command again:

   ```bash
   gcloud builds connections delete "$GCP_CONNECTION_NAME" --region="$GCP_REGION"
   ```

4. In the browser, open the link while signed in to GitHub and authorize the
   **Cloud Build** GitHub App (Cloud Build stores the token in Secret Manager
   in the project). The message recommends a robot account; for a repository
   of a personal account, that account is fine.
5. Install the app: choose the account `$GITHUB_OWNER`, **Only select
   repositories** → `$GITHUB_REPO` → **Install**.
6. Check that `installationState.stage` is `COMPLETE`:

   ```bash
   gcloud builds connections describe "$GCP_CONNECTION_NAME" \
     --region="$GCP_REGION" --format="value(installationState.stage)"
   ```

   - `PENDING_USER_OAUTH`: step 4 is not done yet.
   - `PENDING_INSTALL_APP`: the authorization is done but the app is not
     installed for the repository. If the app is already installed on the
     account (GitHub **Settings** → **Applications** → **Installed GitHub
     Apps** → **Google Cloud Build**), choose **Configure**, add `$GITHUB_REPO`
     under **Repository access** and **Save**. Then open the link of the
     remaining step and check again:

     ```bash
     gcloud builds connections describe "$GCP_CONNECTION_NAME" \
       --region="$GCP_REGION" --format="value(installationState.actionUri)"
     ```

   To start over: delete the connection (the delete command in step 3),
   uninstall **Google Cloud Build** in **Installed GitHub Apps** and revoke it
   in **Authorized GitHub Apps**, then repeat from step 3.

#### Azure: Azure DevOps organization, project and GitHub connection

Everything here is done in the browser. Azure DevOps treats the same e-mail
address as **two accounts**: the personal Microsoft account and the member of
your Microsoft Entra tenant ("Default Directory"). You create the organization
with the personal account and then connect it to the tenant; from then on you
open it as the tenant member. The two accounts have separate profiles (the
name and the country shown can differ) and separate lists of organizations.

| Page | URL | What it is |
|---|---|---|
| Profile and organization list | `https://aex.dev.azure.com` | Your profile, a drop-down to switch between **Microsoft account** and the tenant, and the organizations of that account. It shows **Create new organization** whenever the selected account has no organization in the list |
| Organization | `https://dev.azure.com/$ADO_ORG` | The organization's projects, and **Organization settings** (bottom left) |
| Project | `https://dev.azure.com/$ADO_ORG/$ADO_PROJECT` | The project, and **Project settings** (bottom left; a different page from **Organization settings**) |

1. Check your account in the Azure portal: **Microsoft Entra ID** →
   **Overview** shows the tenant (normally "Default Directory"); in
   **Users**, your account's **User type** must be **Member** (a guest
   cannot connect the organization).
2. Create the organization:
   1. Open <https://aex.dev.azure.com> (<https://dev.azure.com> redirects there;
      from the Azure portal: **Azure DevOps organizations** → **My Azure DevOps
      Organizations**) and sign in with **the same account** as the Azure
      portal. The profile page opens; the drop-down under your name shows
      **Microsoft account**.
   2. Choose **Create new organization** → **Continue** (terms of service).
   3. Name: `$ADO_ORG`; choose the region that hosts the projects (for example
      East Asia), enter the characters shown → **Continue**.

   No Azure subscription is needed. Link one only for paid features (for
   example more parallel jobs): **Organization settings** → **Billing**.
3. Create the project: the next page is **Create a project to get started**.
   Project name: `$ADO_PROJECT`; **Visibility** stays **Private** → **Create
   project**. The project's welcome page ("Welcome to the project!") opens;
   nothing needs to be done there.
4. Connect the organization to the tenant:
   1. Select the organization name (`$ADO_ORG`) in the breadcrumb at the top,
      then **Organization settings** (bottom left) → **Microsoft Entra**. The
      page shows **Connect directory** (not connected yet).
   2. **Connect directory** → select the tenant from step 1 → **Connect**.
      Nothing in the organization is deleted.
   3. Choose **Sign out** when asked.
5. Sign in again and open the organization as the tenant member:
   1. Open `https://dev.azure.com/$ADO_ORG` **directly** (not
      aex.dev.azure.com) and sign in with the same e-mail address. If asked
      for the account type, choose the work or school account.
   2. The organization page shows the project `$ADO_PROJECT`. The initials in
      the top right can differ from before: this is the tenant member's
      profile.
   3. **Organization settings** → **Microsoft Entra** shows the tenant name.
   4. Bookmark `https://dev.azure.com/$ADO_ORG`. The list on
      <https://aex.dev.azure.com> can stay empty and show **Create new
      organization**, with either **Microsoft account** or the tenant
      selected. **Do not create the organization again**; open it with the
      URL.
6. Connect GitHub from the project (as the tenant member, step 5):
   1. Open `https://dev.azure.com/$ADO_ORG/$ADO_PROJECT` → **Project
      settings** (bottom left) → **Boards** → **GitHub connections**.
   2. Choose **New connection** → **GitHub**, sign in to GitHub as
      `$GITHUB_OWNER` and authorize when asked.
   3. Install the GitHub App when asked: **Only select repositories** →
      `$GITHUB_REPO`, and select only `$GITHUB_REPO` in Azure DevOps → save.
   4. The list shows the connection `$GITHUB_OWNER` with the authentication
      type **GitHub App** and the repository `$GITHUB_OWNER/$GITHUB_REPO`.

   Do not start from <https://github.com/apps/azure-pipelines> on GitHub: it
   opens the page **Setup your Azure Pipelines project**, which creates a new
   organization and cannot select an organization connected to the tenant.
   If that page is open, close it without choosing **Continue**.
7. Check the service connection used by the pipelines: in the same
   **Project settings**, open **Pipelines** → **Service connections**.
   - A connection named `github.com_$GITHUB_OWNER` (for example
     `github.com_Otazoman`) with the type **GitHub — using azure pipelines
     app** must be listed. Its name is the value for the cdktn config; the ID
     is not needed (cdktn looks the connection up by name).
   - The **GitHub connections** entry of step 6 and this service connection
     are separate items. cdktn uses only the service connection.
   - If the service connection is not listed, open **Pipelines** in the
     project's left menu → **Create Pipeline** → **GitHub**, select
     `$GITHUB_REPO`, approve the app if asked, and close the page **Configure
     your pipeline** without saving (cdktn creates the pipeline). Then check
     again.

   With the CLI (signed in as the tenant member with `az login`):

   ```bash
   az devops service-endpoint list --organization "https://dev.azure.com/$ADO_ORG" \
     --project "$ADO_PROJECT" \
     --query "[].{name:name, type:type, auth:authorization.scheme}" --output table
   ```

   The GitHub App connection has the type `GitHub` and the scheme
   `InstallationToken`.

8. Add the service principal that runs cdktn to the organization. Creating
   the build agent pool (Managed DevOps Pool) registers it in the
   organization, so the identity of cdktn (`ARM_CLIENT_ID` in `.env.<env>`)
   must be a member with the permissions below. `.env.<env>` does not change.
   1. Find its display name on the host (the container has no Azure CLI;
      `az login` first). The value of `ARM_CLIENT_ID` is not printed:

      ```bash
      cd <repository root>
      ARM_CLIENT_ID="$(grep '^ARM_CLIENT_ID=' .env.<env> | cut -d= -f2- | tr -d "\"'")"
      az ad sp show --id "$ARM_CLIENT_ID" --query displayName --output tsv
      unset ARM_CLIENT_ID
      ```

      Or in the Azure portal: **Microsoft Entra ID** → **App registrations**
      → **All applications**, the entry whose **Application (client) ID**
      equals `ARM_CLIENT_ID`. A principal created with `az ad sp
      create-for-rbac` is named `azure-cli-<date>`; you can rename it there
      (for example `cdktn-dev`) before adding it — the ID does not change.
   2. `https://dev.azure.com/$ADO_ORG` → **Organization settings** →
      **Users** → **Add users**: **Users or Service Principals**: the display
      name; **Access level**: **Basic**; **Add to projects**: `$ADO_PROJECT`;
      **Azure DevOps Groups**: **Project Administrators** → **Add** (the
      e-mail invitation does not apply to service principals).
   3. **Organization settings** → **Pipelines** → **Agent pools** →
      **Security** → **Add**: the service principal, role
      **Administrator**.
   4. The project → **Project settings** → **Service connections** →
      `github.com_$GITHUB_OWNER` → **⋮** → **Security** → **User
      permissions** (tab **Project**) → **Add**: the service principal, role
      **Administrator** (needed to permit the pipeline to use the
      connection). The list then shows it with the access **Assigned**.
      Leave **Pipeline permissions** ("No permitted pipelines") as it is: the
      pipeline is permitted when it is created.

   Steps 8.3 and 8.4 are the expected minimum; if the first deploy of the
   Azure CI/CD reports missing permissions, add them and update this guide.

9. Register the resource providers of the build agents. **Once per
   subscription**, before the first deploy of the Azure CI/CD. With the
   Azure CLI signed in with your account (the Azure portal Cloud Shell, `>_`
   at the top, or a machine with `az login`):

   ```bash
   az provider register --namespace Microsoft.DevOpsInfrastructure
   az provider register --namespace Microsoft.DevCenter
   ```

   The commands return at once with "Registering is still on-going";
   registration usually takes a few minutes (up to about 15). Wait until both
   are `Registered`:

   ```bash
   for ns in Microsoft.DevOpsInfrastructure Microsoft.DevCenter; do
     until [ "$(az provider show --namespace "$ns" --query registrationState -o tsv 2>/dev/null)" = "Registered" ]; do
       echo "$ns: waiting..."; sleep 30
     done
     echo "$ns: Registered"
   done
   ```

   A `SyntaxWarning` printed by the Azure CLI itself (for example with
   Python 3.14) is harmless. If a provider stays `Registering` for more than
   30 minutes, check it in the portal.

   Or in the portal: **Subscriptions** → the subscription → **Settings** →
   **Resource providers** → select `Microsoft.DevOpsInfrastructure` →
   **Register**; the same for `Microsoft.DevCenter`; wait until the status is
   **Registered**.
10. Write the object ID of the **DevOpsInfrastructure** service principal to
    `.env.<env>`. **Once per Microsoft Entra tenant** (the service principal
    and its ID do not change; environments in the same tenant use the same
    value), when preparing `.env.<env>` — before starting the container
    (section 1). The Managed DevOps Pool joins its agents to the VNet through
    this service principal, so it needs Reader and Network Contributor on the
    VNet; cdktn assigns both itself before creating the pool.
    1. After step 9 (the service principal appears in the tenant when
       `Microsoft.DevOpsInfrastructure` is registered; if nothing is printed,
       wait a few minutes and run it again):

       ```bash
       az ad sp list --display-name DevOpsInfrastructure --query "[0].id" -o tsv
       ```

       Or in the portal: **Microsoft Entra ID** → **Enterprise applications**
       → remove the filter **Application type == Enterprise Applications** →
       search `DevOpsInfrastructure` → **Object ID**.
    2. Add it to `.env.<env>`: `AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID=<object ID>`.

    Without it, synth prints a warning and creating the pool fails unless the
    two roles were assigned by hand.
11. Add `azure-pipelines.yml` to the application repository (build, push to
    the ACR, `az containerapp update`). cdktn creates the pipeline, its
    variables and its permissions; the pipeline starts on pushes to
    `cicdTrigger.branches`.

#### Write the values to the cdktn config

| Value | File | Item |
|---|---|---|
| `$GITHUB_OWNER`, `$GITHUB_REPO` | `config/cicd.ts` | `appRepository` (shared by every cloud) |
| Branches that start the build | `config/cicd.ts` | `cicdTrigger.branches` (`byEnv`: dev `dev`, stg `staging`, prod `prod`) |
| `$AWS_CONNECTION_NAME` | `config/aws/cicd/cicdsettings.ts` | `codebuild.codeConnectionName` (`byEnv`; default `multicloud-github`). The ARN is looked up by name at plan time |
| `$GCP_CONNECTION_NAME` | `config/google/cicdsettings.ts` | `githubTrigger.connectionName` (the connection must be in the region of `cloudbuildPrivatePool.location`, `$GCP_REGION`) |
| `$ADO_ORG`, `$ADO_PROJECT`, the service connection name from step 7 (`github.com_$GITHUB_OWNER`) | `config/azure/cicd.ts` | `organization`, `project`, `githubServiceConnectionName` (`byEnv`). The service principal of step 8 needs no config value (cdktn signs in with `ARM_CLIENT_ID` / `ARM_CLIENT_SECRET` / `ARM_TENANT_ID`) |
| Object ID of step 10 | `.env.<env>` | `AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID` |

Without `codeConnectionName`, synth prints a warning and the CodeBuild
project is created without a webhook (it cannot read the private
repository).

## 6. Configuration

Every setting is described in [configuration/](configuration/README.md) (common, AWS, Google Cloud, Azure).

Values that differ per environment are written with `byEnv()`
(`config/environment.ts`) where they are set, for example:

```ts
instanceType: byEnv({ dev: "t3.micro", stg: "t3.small", prod: "t3.medium" }),
build: byEnv({ default: false, stg: true }),   // default + overrides
```

Names that must be unique across all environments (Key Vault, ACR, Azure
Database servers, storage accounts) use `envScopedName()`: `dev` keeps the
name and other environments get the environment name appended.

Global switches are in `config/commonsettings.ts`:

| Setting | Description |
|---|---|
| `accounts` | Account IDs per environment (section 2) |
| `vpnMode` | `"singleTunnel"`: single-tunnel VPN with static routes. `"haBgp"`: HA VPN with BGP. Default: `dev` / `stg` `singleTunnel`, `prod` `haBgp` |
| `useVpn` | Create VPN resources |
| `awsToGoogle`, `awsToAzure`, `googleToAzure` | Create a **direct** VPN connection between the pair. With two of them enabled (e.g. AWS–Azure and Google–Azure), the shared cloud acts as a hub and routes between the other two via BGP (`haBgp` only) |
| `hostZones` | Create private DNS zones and cross-cloud DNS forwarding |
| `clouds.<cloud>.enabled` | Create the cloud's network and everything on it (`<cloud>`: `aws`, `google`, `azure`) |
| `clouds.<cloud>.features` | Per-cloud features: `vms`, `dbs` (managed databases), `storage` (file storage), `containers` (managed containers and their load balancers), `cicd`, `dns` (public DNS zones and records), `alerting` (notification targets and alarms), `logArchive` (archive container logs to object storage) |

BGP inside addresses (APIPA) of each VPN pair, used with `haBgp`, are set in
`config/vpn/addressPlan.ts`; `npx jest __tests__/addressPlan.test.ts` checks
them. ASNs are set per cloud in `config/<cloud>/vpn.ts`.

Features do not depend on VPN connections: a feature is created whenever its
cloud and the feature are enabled, even with `useVpn = false`.

Per-cloud settings (networks, VM sizes, database engines, container images,
load balancers, VPN parameters, ...) are in `config/aws/`, `config/azure/` and
`config/google/`.

### Resource names

Every resource name — including the names of sub-resources such as
Application Gateway listeners or IP configurations — is set in the config file
of the feature that creates it (for example VPN names in
`config/<cloud>/vpn.ts`, subnet names in `config/<cloud>/vpc*/subnets.ts`).

- Where an entry's `name` is a logical key referenced from other settings,
  the actual cloud-side name is set separately (`resourceName`, or a `names`
  block for the resources created for that entry).
- When a name is omitted, a default name is generated:
  `<PROJECT_NAME>-<cloud>-<resource type>[-<key>]`, adjusted to the naming
  rules of the resource (allowed characters, maximum length).
  `PROJECT_NAME` is set in `config/naming.ts`.
- Names fixed by the cloud provider (e.g. Azure `GatewaySubnet`,
  `AzureBastionSubnet`, `privatelink.file.core.windows.net`) cannot be changed.

Renaming a resource usually forces the cloud provider to replace it. Check
`cdktn diff` before deploying a name change.

The Terraform address (construct ID) of most entries is built from the entry's
name. To rename an entry without Terraform treating it as a new resource, set
`key` to the previous name (for example `key: "old-name"`). Azure Files shares
use `shareKey`, Container Apps environments use `environmentKey`.

## 7. First deploy

Inside the container of the environment (section 1):

Before the first deploy, check the preparation of the features you enabled:

| Feature | Check |
|---|---|
| All | `.env.<env>` filled before the container was started (section 1); `npm install` and `cdktn get` done in the container |
| AWS CI/CD | CodeConnections connection `AVAILABLE`, the repository in the GitHub App, the `codebuild` / `ecr` / `codeconnections` permissions of the IAM user (section 5, "AWS") |
| Google CI/CD | APIs enabled (including Service Networking), GitHub connection `COMPLETE`, the three IAM roles of the cdktn service account (section 5, "Google Cloud") |
| Azure CI/CD | Steps 1–10 of "Azure: Azure DevOps ..." (organization, project, GitHub service connection, service principal in the organization, resource providers, `AZURE_DEVOPS_INFRASTRUCTURE_PRINCIPAL_ID`), role assignment permission (section 5, "Azure"), `azure-pipelines.yml` in the application repository |
| AWS HTTPS load balancer | A certificate: `features.dns` for AWS-managed certificates, or certificate files (`IMPORT`); otherwise use the plain-HTTP pattern (synth warns) |

```bash
echo "$DEPLOY_ENV"      # the environment of this container
npx tsc --noEmit -p .   # type check
cdktn diff              # review the plan
cdktn deploy
```

If the deploy stops with a permission error (`AccessDenied`, `not
authorized`, `403`, `setIamPolicy ... denied`), add the permission named in
the message and run `cdktn deploy` again: the resources already created are
in the state and are not created twice. Then add the missing permission to
this guide.

The state is written to `state/<env>/terraform.tfstate` (ignored by Git; keep
it on the work machine).

See [operations.md](operations.md) for destroy procedures and known issues.
