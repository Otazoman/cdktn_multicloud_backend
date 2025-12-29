import { TerraformStack } from "cdktf";
import { Construct } from "constructs";
import { hostZones, useDbs, useVms, useVpn } from "../config/commonsettings";
import { createProviders } from "../providers/providers";
import {
  createDatabaseResources,
  DatabaseResourcesOutput,
} from "../resources/databaseResources";
import { createPrivateZoneResources } from "../resources/privateZoneResources";
import { createVmResources } from "../resources/vmResources";
import { createVpcResources } from "../resources/vpcResources";
import { createVpnResources } from "../resources/vpnResources";

export class MultiCloudBackendStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // providers
    const { awsProvider, googleProvider, azureProvider } =
      createProviders(this);

    // vpc,vnet
    const vpcResources = createVpcResources(
      this,
      awsProvider,
      googleProvider,
      azureProvider
    );

    // VPN
    if (useVpn) {
      createVpnResources(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
        vpcResources.awsVpcResources,
        vpcResources.googleVpcResources,
        vpcResources.azureVnetResources
      );
    }

    // VM
    if (useVms) {
      createVmResources(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
        vpcResources.awsVpcResources,
        vpcResources.googleVpcResources,
        vpcResources.azureVnetResources
      );
    }

    // Database
    let databaseResourcesOutput: DatabaseResourcesOutput | undefined;
    if (useDbs) {
      databaseResourcesOutput = createDatabaseResources(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
        vpcResources.awsVpcResources,
        vpcResources.googleVpcResources,
        vpcResources.azureVnetResources
      );
    }

    // Private DNS zones (Route53 / Cloud DNS) associated with VPCs
    // Create and register private zones for AWS/GCP/Azure networks
    // Must be created after databases to reference actual endpoints for CNAME records
    if (hostZones) {
      createPrivateZoneResources(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
        vpcResources.awsVpcResources,
        vpcResources.googleVpcResources,
        vpcResources.azureVnetResources,
        databaseResourcesOutput?.awsDbResources,
        databaseResourcesOutput?.googleCloudSqlInstances,
        databaseResourcesOutput?.azureDatabaseResources
      );
    }
  }
}
