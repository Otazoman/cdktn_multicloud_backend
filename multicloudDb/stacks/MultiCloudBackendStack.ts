import { TerraformOutput, TerraformStack } from "cdktf";
import { Construct } from "constructs";
import { useVms, useVpn, useDbs } from "../config/commonsettings";
import { createProviders } from "../providers/providers";
import {
  createDatabaseResources,
  DatabaseResourcesOutput,
} from "../resources/databaseResources";
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
    if (useDbs) {
      const databaseResourcesOutput: DatabaseResourcesOutput | undefined =
        createDatabaseResources(
          this,
          awsProvider,
          googleProvider,
          azureProvider,
          vpcResources.awsVpcResources,
          vpcResources.googleVpcResources,
          vpcResources.azureVnetResources
        );

      if (databaseResourcesOutput) {
        // rdsMasterUserSecretArnsとauroraMasterUserSecretArnsはdatabaseResources.ts内でTerraformOutputとして直接生成されるため、ここでは参照しない
        new TerraformOutput(this, "google_cloudsql_connection_names", {
          value: databaseResourcesOutput.googleCloudSqlConnectionNames,
          description: "Connection names for Google CloudSQL instances",
        });
      }
    }
  }
}
