# Getting started

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

```bash
docker compose up -d --build
docker compose exec cdktn-backend bash   # working directory: /app
npm install
```

## 2. Cloud credentials

Copy `.env.sample` to `.env` in the **repository root** and fill in the values.
`compose.yaml` passes this file to the container; the Terraform providers read
the standard environment variables.

| Variable | Description |
|---|---|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | AWS IAM user credentials |
| `ARM_SUBSCRIPTION_ID`, `ARM_CLIENT_ID`, `ARM_CLIENT_SECRET`, `ARM_TENANT_ID`, `ARM_ENVIRONMENT` | Azure service principal |
| `GOOGLE_CLOUD_KEYFILE_JSON` | Path **inside the container** to the Google Cloud service account key. `compose.yaml` mounts the host directory that contains the key |
| `GOOGLE_CLOUD_PROJECT` | Google Cloud project ID |
| `NODE_VERSION`, `TERRAFORM_VERSION`, `OPENTOFU_VERSION` | Tool versions used to build the image |

Regions, the Azure location and the Google Cloud project are set in
`config/aws/common.ts`, `config/azure/common.ts` and `config/google/common.ts`.

## 3. Application secrets

Copy `config/.env.sample` to `config/.env` and fill in the values.

| Variable | Used by |
|---|---|
| `AWSDB_ROOT_USER`, `AWSDB_ROOT_PASSWORD` | RDS / Aurora administrator |
| `GOOGLEDB_ROOT_USER`, `GOOGLEDB_ROOT_PASSWORD` | Cloud SQL administrator |
| `AZUREDB_ROOT_USER`, `AZUREDB_ROOT_PASSWORD` | Azure Database administrator |
| `AZURE_APPGW_SSL_CERT_PASSWORD` | Password of the Application Gateway PFX certificate (section 4) |
| `GOOGLE_AZURE_VPN_PRESHARED_KEY` | Pre-shared key of the Google Cloud ↔ Azure VPN tunnels |
| `ECS_WORKER_POSTGRES_PASSWORD` | `POSTGRES_PASSWORD` environment variable of the ECS `worker-service` |

Wrap values that contain `#` in double quotes; otherwise the rest of the line
is treated as a comment.

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
          "codebuild:ListProjects"
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
      }
    ]
  }
  ```

### Google Cloud

Enable the APIs for the features you use:

| Feature | APIs |
|---|---|
| Cloud SQL | Cloud Resource Manager API, Cloud SQL Admin API, Service Networking API |
| Cloud Run | Cloud Run Admin API, IAM API, Artifact Registry API, Cloud Build API, Serverless VPC Access API, Cloud Filestore API |
| Filestore | Cloud Filestore API |

```bash
PROJECT=your-project-id
USER_EMAIL=you@example.com
SERVICE_ACCOUNT=your-sa@your-project-id.iam.gserviceaccount.com

gcloud config set project "$PROJECT"
gcloud services enable run.googleapis.com iam.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="user:${USER_EMAIL}" --role="roles/run.admin"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" --role="roles/run.admin"
```

The service account used by cdktn needs the **Network Administrator** role for
Cloud SQL (the Editor role is not sufficient).

### Azure

- **Container Apps**: register the `Microsoft.App` resource provider.

  ```bash
  az login
  az provider register --namespace Microsoft.App
  az provider show --namespace Microsoft.App --query registrationState
  ```

- **Azure Database for MySQL in Japan East**: request quota / region access
  before the first deploy, otherwise creation fails
  ([how to request](https://learn.microsoft.com/azure/quotas/quickstart-increase-quota-portal)).

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

## 6. Configuration

Global switches are in `config/commonsettings.ts`:

| Setting | Description |
|---|---|
| `env` | `"dev"`: single-tunnel VPN with static routes. `"prod"`: HA VPN with BGP |
| `useVpn` | Create VPN resources |
| `awsToGoogle`, `awsToAzure`, `googleToAzure` | Create a **direct** VPN connection between the pair. With two of them enabled (e.g. AWS–Azure and Google–Azure), the shared cloud acts as a hub and routes between the other two via BGP (`prod` only) |
| `hostZones` | Create private DNS zones and cross-cloud DNS forwarding |
| `clouds.<cloud>.enabled` | Create the cloud's network and everything on it (`<cloud>`: `aws`, `google`, `azure`) |
| `clouds.<cloud>.features` | Per-cloud features: `vms`, `dbs` (managed databases), `storage` (file storage), `containers` (managed containers and their load balancers), `cicd`, `dns` (public DNS zones and records), `alerting` (notification targets and alarms), `logArchive` (archive container logs to object storage) |

BGP inside addresses (APIPA) of each VPN pair, used in `prod`, are set in
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

```bash
npx tsc --noEmit -p .   # type check
cdktn diff              # review the plan
cdktn deploy
```

See [operations.md](operations.md) for destroy procedures and known issues.
