# MultiCloud Container

# Description

## AzureDatabase Note:

- AzureDatabase for MySQL  
  When using Azure Database for MySQL in the Tokyo location, you must first apply for quota removal or you will encounter an error. You need to apply for quota removal before the first execution. Region access restrictions must be lifted; core count and other factors do not seem to be an issue.  
  [https://learn.microsoft.com/ja-jp/azure/quotas/quickstart-increase-quota-portal
  ](https://learn.microsoft.com/ja-jp/azure/quotas/quickstart-increase-quota-portal)

## CloudSQL Note :

- Additional API Setting  
  The following APIs must be enabled

  ```
  Cloud Resource Manager API
  Cloud SQL Admin API
  Service Networking API
  ```

  [https://docs.cloud.google.com/endpoints/docs/openapi/enable-api?hl=ja](https://docs.cloud.google.com/endpoints/docs/openapi/enable-api?hl=ja)

- Additional Service Account Setting  
  The service account requires the [Network Administrator] role via IAM; Cloud SQL will not function with the [Editor] role.  
  [https://docs.cloud.google.com/iam/docs/manage-access-service-accounts?hl=ja](https://docs.cloud.google.com/iam/docs/manage-access-service-accounts?hl=ja)

- Destroy  
   First, use the `cdktf destroy` command to delete CloudSQL. Since errors occur during this process, release the private service within Private Service Access before executing `cdktf destroy`. After that, you must delete the VPC peering record within the VPC peering network.  
   ※ Dependencies are involved, which is the cause, but it seems Terraform cannot handle this at present.  
  [https://github.com/hashicorp/terraform-provider-google/issues/16275](https://github.com/hashicorp/terraform-provider-google/issues/16275)

## AWS ECS Note:

- Grant ECS permissions to the user for CDKTN.
- Add AmazonElasticFileSystemFullAccess to the role for AWS

## AzureContainerApps Note:

- You cannot run ACA without registering Microsoft.App, as you lack the necessary permissions.

```bash
az login
az provider register --namespace Microsoft.App
az provider show --namespace Microsoft.App --query registrationState
```

## CloudRun Note :

- Keep the CloudFireStoreAPI enabled.
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

## AWS EFS Note:

Amazon Elastic File System Full Access permissions must be added to the IAM user in CDKTN.

## Google Filestore Note:

You must enable the CloudFireStore API.
