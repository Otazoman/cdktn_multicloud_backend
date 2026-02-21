import { TerraformStack } from "cdktn";
import { Construct } from "constructs";
import {
  hostZones,
  useDbs,
  useDns,
  useLbs,
  useVms,
  useVpn,
} from "../config/commonsettings";
import { createProviders } from "../providers/providers";
import { createDatabaseResources } from "../resources/databaseResources";
import {
  DatabaseResourcesOutput,
  LbResourcesOutputWithDns,
} from "../resources/interfaces";
import { createLbResources } from "../resources/loadBarancerResources";
import { createPrivateZoneResources } from "../resources/privateZoneResources";
import { createPublicDnsZonesAndRecords } from "../resources/publicDnsResources";
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
      azureProvider,
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
        vpcResources.azureVnetResources,
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
        vpcResources.azureVnetResources,
      );
    }

    // Load Balancer with SSL/TLS certificates and DNS information
    let lbResourcesOutput: LbResourcesOutputWithDns | undefined;
    if (useLbs) {
      lbResourcesOutput = createLbResources(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
        vpcResources.awsVpcResources,
        vpcResources.googleVpcResources,
        vpcResources.azureVnetResources,
      );

      // Public DNS A records for load balancers (if enabled)
      // Note: Public DNS zones must be created manually in advance
      // Set useDns=true to automatically create A records in existing zones
      if (useDns && lbResourcesOutput) {
        createPublicDnsZonesAndRecords(
          this,
          awsProvider,
          googleProvider,
          azureProvider,
          lbResourcesOutput,
        );
      }
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
        vpcResources.azureVnetResources,
      );
    }

    // Private DNS zones (Route53 / Cloud DNS) associated with VPCs
    // Create and register private zones for AWS/GCP/Azure networks
    // Must be created after databases to reference actual endpoints for CNAME records
    if (hostZones && databaseResourcesOutput) {
      createPrivateZoneResources(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
        vpcResources.awsVpcResources,
        vpcResources.googleVpcResources,
        vpcResources.azureVnetResources,
        databaseResourcesOutput.awsDbResources,
        databaseResourcesOutput.googleCloudSqlInstances,
        databaseResourcesOutput.azureDatabaseResources,
      );
    }
  }
}
