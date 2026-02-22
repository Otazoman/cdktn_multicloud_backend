# MultiCloud Container

# Description

## AWS ECS Note:

- Grant ECS permissions to the user for CDKTN.

## AzureContainerApps Note:

- You cannot run ACA without registering Microsoft.App, as you lack the necessary permissions.

```bash
az login
az provider register --namespace Microsoft.App
az provider show --namespace Microsoft.App --query registrationState
```

## CloudRun Note :

- You cannot run Cloud Run without enabling the Cloud Run Admin API.

```bash
PROJECT=Your_Project
USER=YourOparateuser
gcloud config set project ＄PROJECT
gcloud services enable run.googleapis.com
gcloud services enable iam.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud projects add-iam-policy-binding multicloud-sitevpn-project \
  --member="user:${USER}" \
  --role="roles/run.admin"
gcloud services list --enabled | grep run
```

- Service accounts also require permission assignment.

```bash
SERVICE_ACCOUNT=YourServiceAccount
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/run.admin"
```
