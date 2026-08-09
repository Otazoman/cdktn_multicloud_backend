import { DataAzurermPublicIp } from "@cdktn/provider-azurerm/lib/data-azurerm-public-ip";
import { MonitorDiagnosticSetting } from "@cdktn/provider-azurerm/lib/monitor-diagnostic-setting";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { PublicIp } from "@cdktn/provider-azurerm/lib/public-ip";
import { Subnet } from "@cdktn/provider-azurerm/lib/subnet";
import { VirtualNetworkGateway } from "@cdktn/provider-azurerm/lib/virtual-network-gateway";
import { Construct } from "constructs";
import { ITerraformDependable } from "cdktn";

export interface VpnGatewayParams {
  resourceGroupName: string;
  virtualNetworkName: string;
  VpnGatewayName: string;
  gatewaySubnetCidr: string;
  publicIpNames: string[];
  location: string;
  vpnProps: {
    type: string;
    vpnType: string;
    sku: string;
    azureAsn: number;
    pipAlloc: string;
    awsGwIp1ip1?: string;
    awsGwIp1ip2?: string;
    awsGwIp2ip1?: string;
    awsGwIp2ip2?: string;
    googleGWip1?: string;
    googleGWip2?: string;
  };
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

  // Create Public IP addresses for the VPN Gateway
  const publicIps = params.isSingleTunnel
    ? [
        new PublicIp(scope, `azure_gw_public_ips_${params.publicIpNames[0]}`, {
          provider: provider,
          name: params.publicIpNames[0],
          resourceGroupName: params.resourceGroupName,
          location: params.location,
          allocationMethod: "Static",
          sku: "Standard",
          zones: pipZones,
        }),
      ]
    : params.publicIpNames.map(
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

  // Create a virtual network gateway
  const vng = new VirtualNetworkGateway(scope, "azure_vng", {
    provider: provider,
    name: params.VpnGatewayName,
    resourceGroupName: params.resourceGroupName,
    location: params.location,
    type: params.vpnProps.type,
    vpnType: params.vpnProps.vpnType,
    bgpEnabled: !params.isSingleTunnel, // HA:true, Single:false
    activeActive: !params.isSingleTunnel,
    sku: params.vpnProps.sku,
    bgpSettings: params.isSingleTunnel
      ? undefined
      : {
          asn: params.vpnProps.azureAsn,
          peeringAddresses: [
            {
              ipConfigurationName: "vnetGatewayConfig-1",
              apipaAddresses: [
                params.vpnProps.awsGwIp1ip1,
                params.vpnProps.awsGwIp1ip2,
                params.vpnProps.googleGWip1,
              ].filter((ip): ip is string => ip !== undefined),
            },
            {
              ipConfigurationName: "vnetGatewayConfig-2",
              apipaAddresses: [
                params.vpnProps.awsGwIp2ip1,
                params.vpnProps.awsGwIp2ip2,
                params.vpnProps.googleGWip2,
              ].filter((ip): ip is string => ip !== undefined),
            },
          ],
        },
    ipConfiguration: params.isSingleTunnel
      ? [
          {
            name: "vnetGatewayConfig-1",
            publicIpAddressId: publicIps[0].id,
            privateIpAddressAllocation: params.vpnProps.pipAlloc,
            subnetId: gatewaySubnet.id,
          },
        ]
      : [
          {
            name: "vnetGatewayConfig-1",
            publicIpAddressId: publicIps[0].id,
            privateIpAddressAllocation: params.vpnProps.pipAlloc,
            subnetId: gatewaySubnet.id,
          },
          {
            name: "vnetGatewayConfig-2",
            publicIpAddressId: publicIps[1].id,
            privateIpAddressAllocation: params.vpnProps.pipAlloc,
            subnetId: gatewaySubnet.id,
          },
        ],
    tags: params.tags,
  });

  // Retrieve Public IP data (wait for Azure creation to complete)
  const publicIpData = params.isSingleTunnel
    ? [
        new DataAzurermPublicIp(scope, `pip_vgw_${params.publicIpNames[0]}`, {
          name: params.publicIpNames[0],
          resourceGroupName: params.resourceGroupName,
          dependsOn: [vng],
        }),
      ]
    : params.publicIpNames.map(
        (name) =>
          new DataAzurermPublicIp(scope, `pip_vgw_${name}`, {
            name,
            resourceGroupName: params.resourceGroupName,
            dependsOn: [vng],
          }),
      );

  // Attach Diagnostic Setting if Log Analytics Workspace ID is provided
  let diagnosticSetting: MonitorDiagnosticSetting | undefined;
  if (params.logAnalyticsWorkspaceId) {
    diagnosticSetting = new MonitorDiagnosticSetting(
      scope,
      "azure_vng_diagnostic_setting",
      {
        provider: provider,
        name: `${vng.name}-diagnostic-setting`,
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
