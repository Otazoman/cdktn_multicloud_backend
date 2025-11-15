# MultiCloud DB Replication

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
