import { TerraformStack } from "cdktn";
import { Construct } from "constructs";
import {
  hostZones,
  useContainers,
  useDbs,
  useDns,
  useLbs,
  useStorage,
  useVms,
  useVpn,
} from "../config/commonsettings";
import { createProviders } from "../providers/providers";
import { createComputeResources } from "../resources/containerResources";
import { createDatabaseResources } from "../resources/databaseResources";
import {
  CreatedPublicZones,
  DatabaseResourcesOutput,
  LbResourcesOutputWithDns,
} from "../resources/interfaces";
import { createLbResources } from "../resources/loadBarancerResources";
import { createPrivateZoneResources } from "../resources/privateZoneResources";
import {
  createPublicDnsRecords,
  createPublicDnsZones,
} from "../resources/publicDnsResources";
import { createStorageResources } from "../resources/storageResources";
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

    // 4. Storage Phase
    // let storageResourcesOutput: StorageResourcesOutput | undefined;
    if (useStorage) {
      // storageResourcesOutput = createStorageResources(
      createStorageResources(this, awsProvider, googleProvider, azureProvider, {
        awsVpcResources: vpcResources.awsVpcResources,
        googleVpcResources: vpcResources.googleVpcResources,
        googleSubnets: vpcResources.googleVpcResources?.subnets || [],
      });
    }
    // Load Balancer with SSL/TLS certificates and DNS information
    // DNS Zones Phase (Create zones first)
    let dnsZones: CreatedPublicZones | undefined;
    if (useDns) {
      // Subdomain extraction is handled internally by createPublicDnsZones
      dnsZones = createPublicDnsZones(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
      );
    }

    // Load Balancer Phase (Pass dnsZones to enable Certificate Validation without Data sources)
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
        dnsZones, // Pass created zones here!
      );

      // DNS Records Phase (Register A records now that LB IPs are available)
      if (useDns && lbResourcesOutput && dnsZones) {
        createPublicDnsRecords(
          this,
          awsProvider,
          googleProvider,
          azureProvider,
          dnsZones,
          lbResourcesOutput,
        );
      }
    }

    // Container / Compute Phase (新規追加)
    if (useContainers) {
      createComputeResources(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
        vpcResources.awsVpcResources,
        lbResourcesOutput?.awsAlbs, // AWS ECSがターゲットグループを検索するのに必要
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
