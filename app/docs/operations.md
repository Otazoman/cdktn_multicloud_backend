# Operations

Deploy / destroy procedures and known issues. Run all commands inside the
`cdktn-backend` container from `/app`.

## Deploy

```bash
cdktn diff     # always review the plan first
cdktn deploy
```

## Destroy

```bash
cdktn destroy
```

Some managed services release resources asynchronously, so a destroy may stop
with errors even though the dependency order is correct. Check the known issues
below and run `cdktn destroy` again when indicated.

## Known issues

### Google Cloud — Cloud Run: subnet cannot be deleted (wait 1-2 hours, then destroy again)

```
Error 400: The subnetwork resource '.../subnetworks/<vpc>-app-subnet' is already being used by
'.../addresses/serverless-ipv4-...', resourceInUseByAnotherResource
```

Cloud Run Direct VPC egress reserves internal IP addresses (`serverless-ipv4-*`)
that are not managed by Terraform. Google Cloud releases them **1-2 hours after
the Cloud Run service is deleted**, and the subnet (and therefore the VPC)
cannot be deleted before that.

Run `cdktn destroy` again 1-2 hours after the first attempt; the remaining
subnet and VPC are then deleted.
Reference: [Direct VPC egress with a VPC network](https://cloud.google.com/run/docs/configuring/vpc-direct-vpc)

### Google Cloud — Regional load balancer: proxy-only subnet in use

```
Error 400: The subnetwork resource '.../subnetworks/<vpc>-proxy-subnet' is already being used by
'.../forwardingRules/<lb>-http-fw', resourceInUseByAnotherResource
```

The forwarding rule must be deleted before the proxy-only subnet. The
application declares this order explicitly and waits 240 seconds before the
subnet is deleted. If the error still occurs, run `cdktn destroy` again.

### Google Cloud — Cloud SQL: Private Service Access connection cannot be deleted

Deleting the Private Service Access (service networking) connection can fail
while Cloud SQL is being deleted
([terraform-provider-google#16275](https://github.com/hashicorp/terraform-provider-google/issues/16275)).

If it happens:

1. Release the Private Service Access connection of the VPC
   (VPC network → Private service access).
2. Run `cdktn destroy` again.
3. Delete the remaining VPC peering of the VPC network if it still exists.

### Azure — Container Apps: first destroy fails

Destroying Container Apps can fail on the first attempt. Run `cdktn destroy`
again.

### AWS — Aurora / RDS: CloudWatch log groups remain

Aurora / RDS recreate their CloudWatch log groups while being deleted, so the
following log groups can remain after `destroy`. Delete them manually:

```
RDSOSMetrics
/aws/rds/cluster/<cluster-name>/audit
/aws/rds/cluster/<cluster-name>/error
/aws/rds/cluster/<cluster-name>/slowquery
/aws/rds/instance/<instance-name>/audit
/aws/rds/instance/<instance-name>/postgresql
```
