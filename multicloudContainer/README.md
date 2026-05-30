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

- An error occurs when destroying the object, so if an error occurs, try destroying it again.

## CloudRun Note :

- Keep the CloudFireStoreAPI Serverless VPC Access API enabled.
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

- When used in combination with Cloud Load Balancing

An error occurs when I try to delete it, but if I try again, it deletes without any problems.

- When calling `destroy`

## AWS EFS Note:

Amazon Elastic File System Full Access permissions must be added to the IAM user in CDKTN.

## Google Filestore Note:

You must enable the CloudFireStore API.

## AWS ECS Note:

You need to add the “AutoscalingFullAccess” permission in IAM

```json
{
  “Effect”: “Allow”,
  “Action”: “application-autoscaling:*”,
  “Resource”: “*”
}
```

## Sub Domain Note:

Processing on the subdomain side

- AWS subdomain

```bash
SUB_DOMAIN="awstest.YOURDOMAIN"
SUB_NS=$(aws route53 list-hosted-zones-by-name --dns-name "$SUB_DOMAIN" --query "HostedZones[0].Id" --output text | xargs -I {} aws route53 get-hosted-zone --id {} --query "DelegationSet.NameServers" --output text)
echo "NS RECORDS: $SUB_NS"
```

- Google subdomain

```bash
SUB_DOMAIN="googletest.YOURDOMAIN."
PROJECT_NAME="YOUR-PROJECT"
SUB_NS=$(gcloud dns managed-zones list \
  --project="$PROJECT_NAME" \
  --filter="dnsName=$SUB_DOMAIN" \
  --format="value(nameServers.list())")
echo "NS RECORDS: $SUB_NS"
```

- Azure subdomain

```bash
SUB_DOMAIN="azuretest.YOURDOMAIN"
RG_NAME="YOUR_RESOURCE_GROUP"
SUB_NS=$(az network dns zone show -g "$RG_NAME" -n "$SUB_DOMAIN" --query "nameServers" -o tsv)
echo "NS RECORDS: $SUB_NS"
```

Processing on the Route 53 main domain

```bash
YOUR_PARENT_ZONE_ID=YOUR_ZONE_ID
SUB_DOMAIN="YOUR_SUB_DOMAIN"
SUB_NS="PASTE NS RECORDS"

aws route53 change-resource-record-sets \
  --hosted-zone-id "$YOUR_PARENT_ZONE_ID" \
  --change-batch "{
    \"Comment\": \"Update NS for $SUB_DOMAIN\",
    \"Changes\": [
      {
        \"Action\": \"UPSERT\",
        \"ResourceRecordSet\": {
          \"Name\": \"$SUB_DOMAIN.\",
          \"Type\": \"NS\",
          \"TTL\": 60,
          \"ResourceRecords\": [
            $(for ns in $SUB_NS; do echo "{\"Value\": \"$ns\"},"; done | sed '$s/,$//')
          ]
        }
      }
    ]
  }"
```
