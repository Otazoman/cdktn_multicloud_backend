import { TerraformStack } from "cdktn";
import { Construct } from "constructs";
import {
  hostZones,
  useContainers,
  useDbs,
  useDns,
  useStorage,
  useVms,
  useVpn,
} from "../config/commonsettings";
import { createProviders } from "../providers/providers";
import { createAwsContainerResources } from "../resources/awsContainerResources";
import { createAzureContainerResources } from "../resources/azureContainerResources";
import { createDatabaseResources } from "../resources/databaseResources";
import { createGoogleContainerResources } from "../resources/googleContainerResources";
import { DatabaseResourcesOutput } from "../resources/interfaces";
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

    // Storage Phase - must run before VM so PSA peering routes are fully applied
    // before GCE instances are placed in the same VPC.
    let storageResourcesOutput = useStorage
      ? createStorageResources(
          this,
          awsProvider,
          googleProvider,
          azureProvider,
          {
            awsVpcResources: vpcResources.awsVpcResources,
            googleVpcResources: vpcResources.googleVpcResources,
            googleSubnets: vpcResources.googleVpcResources?.subnets || [],
            azureVnetResources: vpcResources.azureVnetResources,
          },
        )
      : undefined;

    // Database Phase - also runs before VM for the same PSA reason.
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

    // Collect PSA TerraformResource references from whichever layer created them.
    const googlePsaDependencies =
      storageResourcesOutput?.googlePsaDependencies ??
      databaseResourcesOutput?.googlePsaDependencies;

    // VM Phase
    if (useVms) {
      createVmResources(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
        vpcResources.awsVpcResources,
        vpcResources.googleVpcResources,
        vpcResources.azureVnetResources,
        googlePsaDependencies,
      );
    }

    // DNS Zones Phase (Create zones first, needed for ACM certificate validation)
    let dnsZones: any | undefined;
    if (useDns) {
      dnsZones = createPublicDnsZones(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
        vpcResources.awsVpcResources,
        vpcResources.googleVpcResources,
        vpcResources.azureVnetResources,
      );
    }

    // ============================================================
    // Container + LB Phase (each cloud is self-contained)
    // ============================================================

    // Azure: ACA first → AppGW with ACA ingressFqdn injected (self-contained)
    let azureResults: { azureAppGws?: any[] } = {};
    if (useContainers && vpcResources.azureVnetResources) {
      azureResults = createAzureContainerResources(
        this,
        azureProvider,
        vpcResources.azureVnetResources,
      );
    }

    // AWS: ALB first → ECS with targetGroupArn (self-contained)
    let awsResults: { awsAlbs?: any[] } = {};
    if (useContainers && vpcResources.awsVpcResources) {
      awsResults = createAwsContainerResources(
        this,
        awsProvider,
        vpcResources.awsVpcResources,
        dnsZones,
      );
    }

    // Google: LB + Cloud Run (self-contained)
    let googleResults: { googleLbs?: any[] } = {};
    if (useContainers && vpcResources.googleVpcResources) {
      googleResults = createGoogleContainerResources(
        this,
        googleProvider,
        vpcResources.googleVpcResources,
      );
    }

    // DNS Records Phase (Register A/CNAME records now that LB IPs are available)
    if (useDns && dnsZones) {
      const lbResourcesOutput = {
        awsAlbs: awsResults.awsAlbs,
        googleLbs: googleResults.googleLbs,
        azureAppGws: azureResults.azureAppGws,
      };
      createPublicDnsRecords(
        this,
        awsProvider,
        googleProvider,
        azureProvider,
        dnsZones,
        lbResourcesOutput as any,
      );
    }

    // Private DNS zones
    // Must be created after databases to reference actual endpoints for CNAME records
    // Note: ACA FQDNs are NOT registered here (ACA + AppGW are self-contained)
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
        // Pass Filestore instance metadata for DNS A record registration in google.inner
        storageResourcesOutput?.googleFilestoreInstances,
        databaseResourcesOutput?.azureDatabaseResources,
        // Pass EFS instance metadata for DNS CNAME registration in aws.inner
        storageResourcesOutput?.awsEfsInstances,
        // Pass Azure Files instance metadata for DNS CNAME registration in azure.inner
        storageResourcesOutput?.azureFilesInstances,
      );
    }
  }
}
