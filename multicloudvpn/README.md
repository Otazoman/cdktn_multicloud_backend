# Cloud to Cloud VPN Connection

Building a cloud-to-cloud VPN with CDK for Terraform
Sample for building VPN connection between AWS, Azure and GoogleCloud with CDK for Terraform

# Description

Run the following command to create a resource with a CDKTF with a secret key to SSH

```
cdktf plan
export ARM_RETRIES=5    # For Azure control
export ARM_BACKOFF=30   # For Azure control
cdktf deploy --parallelism=2 --outputs-file ./outputs/outputs.json --outputs-file-include-sensitive-outputs
```

Note : In Azure, an error may occur in the SubnetNetworkSecurityGroupAssociation, but the resource itself is created without any problem when re-run.

Azure private keys for VMs are retrieved and used in the following manner.
For Google, SSH connection can be made from a browser. For AWS, connect using the EC2 Instance Connect Endpoint.

For AWS, resources should be created manually and deleted manually after the confirmation process.

```
cd outputs
node pemkey-extraction.js
rm outputs.json
```

Snapshot testing is possible. If you want to check for differences, execute the following command in the app.

```
npm run test
```
