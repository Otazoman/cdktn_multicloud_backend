import { DataAzurermPublicIp } from "@cdktn/provider-azurerm/lib/data-azurerm-public-ip";
import { LogAnalyticsWorkspace } from "@cdktn/provider-azurerm/lib/log-analytics-workspace";
import { MonitorDiagnosticSetting } from "@cdktn/provider-azurerm/lib/monitor-diagnostic-setting";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { PublicIp } from "@cdktn/provider-azurerm/lib/public-ip";
import { Subnet } from "@cdktn/provider-azurerm/lib/subnet";
import { VirtualNetworkGateway } from "@cdktn/provider-azurerm/lib/virtual-network-gateway";
import { Construct } from "constructs";

interface VpnGatewayParams {
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
  diagnosticSettings: {
    retentionInDays: number;
  };
  isSingleTunnel: boolean;
  tags?: { [key: string]: string };
}

export function createAzureVpnGateway(
  scope: Construct,
  provider: AzurermProvider,
  params: VpnGatewayParams
) {
  // Create Gateway Subnet for the VPN Gateway
  const gatewaySubnet = new Subnet(scope, "azure_gatewaySubnet", {
    provider: provider,
    resourceGroupName: params.resourceGroupName,
    virtualNetworkName: params.virtualNetworkName,
    name: "GatewaySubnet",
    addressPrefixes: [params.gatewaySubnetCidr],
  });

  // Create Public IP addresses for the VPN Gateway
  const publicIps = params.isSingleTunnel
    ? [
        new PublicIp(scope, `azure_gw_public_ips_${params.publicIpNames[0]}`, {
          provider: provider,
          name: params.publicIpNames[0],
          resourceGroupName: params.resourceGroupName,
          location: params.location,
          allocationMethod: "Static",
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
          })
      );

  // Create a virtual network gateway
  const vng = new VirtualNetworkGateway(scope, "azure_vng", {
    provider: provider,
    name: params.VpnGatewayName,
    resourceGroupName: params.resourceGroupName,
    location: params.location,
    type: params.vpnProps.type,
    vpnType: params.vpnProps.vpnType,
    enableBgp: !params.isSingleTunnel, // HA:true, Single:false
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
          // Single SingleIp
          {
            name: "vnetGatewayConfig-1",
            publicIpAddressId: publicIps[0].id,
            privateIpAddressAllocation: params.vpnProps.pipAlloc,
            subnetId: gatewaySubnet.id,
          },
        ]
      : [
          // HA MultiIP
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
          })
      );

  // Create Log Analytics Workspace for diagnostics
  const logAnalyticsWorkspace = new LogAnalyticsWorkspace(
    scope,
    "azure_log_analytics_workspace",
    {
      provider: provider,
      name: `${vng.name}-loganalytics`,
      location: params.location,
      resourceGroupName: params.resourceGroupName,
      retentionInDays: params.diagnosticSettings.retentionInDays,
    }
  );

  // Create Diagnostic Setting for the VPN Gateway
  const diagnosticSetting = new MonitorDiagnosticSetting(
    scope,
    "azure_vng_diagnostic_setting",
    {
      provider: provider,
      name: `${vng.name}-diagnostic-setting`,
      targetResourceId: vng.id,
      logAnalyticsWorkspaceId: logAnalyticsWorkspace.id,
      enabledLog: [
        {
          category: "GatewayDiagnosticLog",
        },
        {
          category: "TunnelDiagnosticLog",
        },
        {
          category: "RouteDiagnosticLog",
        },
        {
          category: "IKEDiagnosticLog",
        },
      ],
      enabledMetric: [
        {
          category: "AllMetrics",
        },
      ],
    }
  );

  return { publicIpData, virtualNetworkGateway: vng, diagnosticSetting };
}
