import { DataAzurermPublicIp } from "@cdktn/provider-azurerm/lib/data-azurerm-public-ip";
import { MonitorDiagnosticSetting } from "@cdktn/provider-azurerm/lib/monitor-diagnostic-setting";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { PublicIp } from "@cdktn/provider-azurerm/lib/public-ip";
import { Subnet } from "@cdktn/provider-azurerm/lib/subnet";
import { VirtualNetworkGateway } from "@cdktn/provider-azurerm/lib/virtual-network-gateway";
import { Construct } from "constructs";
import { resourceName } from "../../utils/naming";
import { ITerraformDependable } from "cdktn";

export interface VpnGatewayParams {
  resourceGroupName: string;
  virtualNetworkName: string;
  VpnGatewayName: string;
  gatewaySubnetCidr: string;
  publicIpNames: string[];
  /**
   * IP configurations (sub-resources), one per instance.
   * Default: <project>-azure-vng-ip-config-<n>
   */
  ipConfigurationNames?: string[];
  /** Default: <project>-azure-vng-diagnostic-setting */
  diagnosticSettingName?: string;
  location: string;
  vpnProps: {
    type: string;
    vpnType: string;
    sku: string;
    azureAsn: number;
    pipAlloc: string;
  };
  /**
   * Custom APIPA BGP addresses per gateway instance (HA only), e.g.
   * [[instance 1 addresses...], [instance 2 addresses...]].
   */
  apipaAddresses?: string[][];
  isSingleTunnel: boolean;
  publicIpZones?: string[];
  tags?: { [key: string]: string };
  /**
   * Optional Log Analytics Workspace ID for diagnostic settings.
   * If provided, diagnostic settings will be attached to the VPN Gateway.
   */
  logAnalyticsWorkspaceId?: string;
  /**
   * Optional VNet dependencies (e.g. lastSubnet from azurevnet.ts).
   * Used to ensure GatewaySubnet is created after all regular subnets
   * to avoid Azure VNet provisioning state conflicts.
   */
  vnetDependencies?: ITerraformDependable[];
}

export function createAzureVpnGateway(
  scope: Construct,
  provider: AzurermProvider,
  params: VpnGatewayParams,
) {
  // Create Gateway Subnet for the VPN Gateway
  // If vnetDependencies is provided, wait for those resources to complete
  // before creating GatewaySubnet to avoid Azure VNet provisioning state conflicts.
  const gatewaySubnet = new Subnet(scope, "azure_gatewaySubnet", {
    provider: provider,
    resourceGroupName: params.resourceGroupName,
    virtualNetworkName: params.virtualNetworkName,
    name: "GatewaySubnet",
    addressPrefixes: [params.gatewaySubnetCidr],
    dependsOn: params.vnetDependencies,
  });

  // Determine if AZ SKU is used → Public IPs require zones + Standard SKU
  const isAzSku = params.vpnProps.sku.toUpperCase().endsWith("AZ");
  const pipZones = isAzSku
    ? params.publicIpZones ?? ["1", "2", "3"]
    : undefined;

  // Create Public IPs, the Virtual Network Gateway and Public IP data
  // sources. Single tunnel (dev) and HA (prod) are built by separate functions.
  const { virtualNetworkGateway: vng, publicIpData } = params.isSingleTunnel
    ? createSingleTunnelVpnGateway(
        scope,
        provider,
        params,
        gatewaySubnet,
        pipZones,
      )
    : createHaVpnGateway(scope, provider, params, gatewaySubnet, pipZones);

  // Attach Diagnostic Setting if Log Analytics Workspace ID is provided
  let diagnosticSetting: MonitorDiagnosticSetting | undefined;
  if (params.logAnalyticsWorkspaceId) {
    diagnosticSetting = new MonitorDiagnosticSetting(
      scope,
      "azure_vng_diagnostic_setting",
      {
        provider: provider,
        name: resourceName(
          params.diagnosticSettingName,
          "azure",
          "vng-diagnostic-setting",
        ),
        targetResourceId: vng.id,
        logAnalyticsWorkspaceId: params.logAnalyticsWorkspaceId,
        enabledLog: [
          { category: "GatewayDiagnosticLog" },
          { category: "TunnelDiagnosticLog" },
          { category: "RouteDiagnosticLog" },
          { category: "IKEDiagnosticLog" },
        ],
        enabledMetric: [{ category: "AllMetrics" }],
      },
    );
  }

  return {
    publicIpData,
    virtualNetworkGateway: vng,
    diagnosticSetting,
    gatewaySubnet, // Exposed for downstream resources (e.g., DNS Private Resolver) to depend on
  };
}

// Single tunnel (dev): one Public IP, active-standby, no BGP
function createSingleTunnelVpnGateway(
  scope: Construct,
  provider: AzurermProvider,
  params: VpnGatewayParams,
  gatewaySubnet: Subnet,
  pipZones: string[] | undefined,
) {
  const publicIpNames = [params.publicIpNames[0]];
  const publicIps = createPublicIps(
    scope,
    provider,
    params,
    publicIpNames,
    pipZones,
  );

  const vng = new VirtualNetworkGateway(scope, "azure_vng", {
    ...buildBaseVngConfig(provider, params),
    bgpEnabled: false,
    activeActive: false,
    ipConfiguration: [
      {
        name: ipConfigurationName(params, 0),
        publicIpAddressId: publicIps[0].id,
        privateIpAddressAllocation: params.vpnProps.pipAlloc,
        subnetId: gatewaySubnet.id,
      },
    ],
  });

  return {
    virtualNetworkGateway: vng,
    publicIpData: createPublicIpData(scope, params, publicIpNames, vng),
  };
}

// HA (prod): two Public IPs, active-active, BGP with custom APIPA addresses
function createHaVpnGateway(
  scope: Construct,
  provider: AzurermProvider,
  params: VpnGatewayParams,
  gatewaySubnet: Subnet,
  pipZones: string[] | undefined,
) {
  const publicIpNames = params.publicIpNames;
  const publicIps = createPublicIps(
    scope,
    provider,
    params,
    publicIpNames,
    pipZones,
  );

  const vng = new VirtualNetworkGateway(scope, "azure_vng", {
    ...buildBaseVngConfig(provider, params),
    bgpEnabled: true,
    activeActive: true,
    bgpSettings: {
      asn: params.vpnProps.azureAsn,
      peeringAddresses: [
        {
          ipConfigurationName: ipConfigurationName(params, 0),
          apipaAddresses: params.apipaAddresses?.[0] ?? [],
        },
        {
          ipConfigurationName: ipConfigurationName(params, 1),
          apipaAddresses: params.apipaAddresses?.[1] ?? [],
        },
      ],
    },
    ipConfiguration: [
      {
        name: ipConfigurationName(params, 0),
        publicIpAddressId: publicIps[0].id,
        privateIpAddressAllocation: params.vpnProps.pipAlloc,
        subnetId: gatewaySubnet.id,
      },
      {
        name: ipConfigurationName(params, 1),
        publicIpAddressId: publicIps[1].id,
        privateIpAddressAllocation: params.vpnProps.pipAlloc,
        subnetId: gatewaySubnet.id,
      },
    ],
  });

  return {
    virtualNetworkGateway: vng,
    publicIpData: createPublicIpData(scope, params, publicIpNames, vng),
  };
}

// Settings shared by single tunnel and HA Virtual Network Gateways
function buildBaseVngConfig(
  provider: AzurermProvider,
  params: VpnGatewayParams,
) {
  return {
    provider: provider,
    name: params.VpnGatewayName,
    resourceGroupName: params.resourceGroupName,
    location: params.location,
    type: params.vpnProps.type,
    vpnType: params.vpnProps.vpnType,
    sku: params.vpnProps.sku,
    tags: params.tags,
  };
}

// Create Public IP addresses for the VPN Gateway
function createPublicIps(
  scope: Construct,
  provider: AzurermProvider,
  params: VpnGatewayParams,
  publicIpNames: string[],
  pipZones: string[] | undefined,
) {
  return publicIpNames.map(
    (name) =>
      new PublicIp(scope, `azure_gw_public_ips_${name}`, {
        provider: provider,
        name,
        resourceGroupName: params.resourceGroupName,
        location: params.location,
        allocationMethod: "Static",
        sku: "Standard",
        zones: pipZones,
      }),
  );
}

// Retrieve Public IP data (wait for Azure creation to complete)
function createPublicIpData(
  scope: Construct,
  params: VpnGatewayParams,
  publicIpNames: string[],
  vng: VirtualNetworkGateway,
) {
  return publicIpNames.map(
    (name) =>
      new DataAzurermPublicIp(scope, `pip_vgw_${name}`, {
        name,
        resourceGroupName: params.resourceGroupName,
        dependsOn: [vng],
      }),
  );
}

// Name of the n-th (0-based) VPN gateway IP configuration
function ipConfigurationName(params: VpnGatewayParams, index: number): string {
  return resourceName(
    params.ipConfigurationNames?.[index],
    "azure",
    "vng-ip-config",
    String(index + 1),
  );
}
