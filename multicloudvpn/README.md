# Description

Run the following command to create a resource with a CDKTF with a secret key to SSH

```
cdktf plan
cdktf deploy --outputs-file ./outputs/outputs.json --outputs-file-include-sensitive-outputs
```

Azure private keys for VMs are retrieved and used in the following manner.
For Google, SSH connection can be made from a browser. For AWS, connect using the EC2 Instance Connect Endpoint.

For AWS, resources should be created manually and deleted manually after the confirmation process.

```
cd outputs
node pemkey-extraction.js
rm outputs.json
```
