import { TerraformOutput, TerraformStack } from "cdktf";
import { Construct } from "constructs";
import { createProviders } from "../providers/providers";
import { createVmResources } from "../resources/vmResources";
import { createVpcResources } from "../resources/vpcResources";
import { createVpnResources } from "../resources/vpnResources";
import { createSshKey } from "../utils/sshKey";

/*
二度目の実行でAWSのルートテーブル伝播とセキュリティグループが消えてしまう。

     Terraform will perform the following actions:

       # aws_default_route_table.defaultRouteTable (defaultRouteTable) will be updated in-place
       ~ resource "aws_default_route_table" "defaultRouteTable" {
             id                     = "rtb-0fa9ad484c3ed2348"
           ~ propagating_vgws       = [
               - "vgw-05f774e43e142990e",
             ]
             tags                   = {
                 "Name" = "my-aws-vpc-routetable"
             }
             # (6 unchanged attributes hidden)
         }

       # aws_security_group.awsSecurityGroup0 (awsSecurityGroup0) will be updated in-place
       ~ resource "aws_security_group" "awsSecurityGroup0" {
             id                     = "sg-08507f7a29b993069"
           ~ ingress                = [
               - {
                   - cidr_blocks      = []
                   - description      = "Allow SSH from EC2 Instance Connect Endpoint"
                   - from_port        = 22
                   - ipv6_cidr_blocks = []
                   - prefix_list_ids  = []
                   - protocol         = "tcp"
                   - security_groups  = [
                       - "sg-05bbb0678546259a3",
                     ]
                   - self             = false
                   - to_port          = 22
                 },
                 # (1 unchanged element hidden)
             ]
             name                   = "my-aws-vpc-sg1"
             tags                   = {
                 "Name" = "my-aws-vpc-sg1"
             }
             # (8 unchanged attributes hidden)
         }

     Plan: 0 to add, 2 to change, 0 to destroy.

二度目の実行でも削除されずに遺すようにする必要あり。
リファクタリングが必要

*/

export class MultiCloudVpnStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // providers
    const { awsProvider, googleProvider, azureProvider, tlsProvider } =
      createProviders(this);

    // create ssh key
    const sshKey = createSshKey(this, tlsProvider);

    new TerraformOutput(this, "ssh_private_key_output", {
      value: sshKey.privateKeyPem,
      sensitive: true,
    });

    // vpc,vnet
    const vpcResources = createVpcResources(
      this,
      awsProvider,
      googleProvider,
      azureProvider
    );

    // VPN
    const vpnResources = createVpnResources(
      this,
      awsProvider,
      googleProvider,
      azureProvider,
      vpcResources.awsVpcResources,
      vpcResources.googleVpcResources,
      vpcResources.azureVnetResources
    );

    // VM
    createVmResources(
      this,
      awsProvider,
      googleProvider,
      azureProvider,
      vpcResources.awsVpcResources,
      vpcResources.googleVpcResources,
      vpcResources.azureVnetResources,
      sshKey,
      vpnResources
    );
  }
}
