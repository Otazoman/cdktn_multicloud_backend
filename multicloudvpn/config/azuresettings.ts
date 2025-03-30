const resourceGroup = "rg_multicloud";
const location = "Japan East";
const vnetName = "my-azure-vnet";

export const azureCommonparams = {
  resourceGroup: resourceGroup,
  location: location,
};

/* V-NET */
export const azureVnetResourcesparams = {
  resourceGroupName: resourceGroup,
  location: location,
  vnetName: vnetName,
  vnetAddressSpace: "10.2.0.0/16",
  subnets: [
    { name: "subnet1", cidr: "10.2.10.0/24" },
    { name: "subnet2", cidr: "10.2.20.0/24" },
  ],
  nsgRules: [
    {
      name: "AllowVnetInBound",
      priority: 100,
      direction: "Inbound",
      access: "Allow",
      protocol: "*",
      sourcePortRange: "*",
      destinationPortRange: "*",
      sourceAddressPrefix: "VirtualNetwork",
      destinationAddressPrefix: "VirtualNetwork",
    },
    {
      name: "AllowAzureLoadBalancerInBound",
      priority: 101,
      direction: "Inbound",
      access: "Allow",
      protocol: "*",
      sourcePortRange: "*",
      destinationPortRange: "*",
      sourceAddressPrefix: "AzureLoadBalancer",
      destinationAddressPrefix: "*",
    },
    {
      name: "DenyAllInBound",
      priority: 4096,
      direction: "Inbound",
      access: "Deny",
      protocol: "*",
      sourcePortRange: "*",
      destinationPortRange: "*",
      sourceAddressPrefix: "*",
      destinationAddressPrefix: "*",
    },
    {
      name: "AllowVnetOutBound",
      priority: 100,
      direction: "Outbound",
      access: "Allow",
      protocol: "*",
      sourcePortRange: "*",
      destinationPortRange: "*",
      sourceAddressPrefix: "VirtualNetwork",
      destinationAddressPrefix: "VirtualNetwork",
    },
    {
      name: "AllowAllOutBound",
      priority: 4095,
      direction: "Outbound",
      access: "Allow",
      protocol: "*",
      sourcePortRange: "*",
      destinationPortRange: "*",
      sourceAddressPrefix: "*",
      destinationAddressPrefix: "*",
    },
    {
      name: "DenyAllOutBound",
      priority: 4096,
      direction: "Outbound",
      access: "Deny",
      protocol: "*",
      sourcePortRange: "*",
      destinationPortRange: "*",
      sourceAddressPrefix: "*",
      destinationAddressPrefix: "*",
    },
  ],
};

/* VPN */
export const azureVpnparams = {
  gatewaySubnetCidr: "10.2.100.0/24",
  publicIpNames: ["vpn-gateway-ip-1", "vpn-gateway-ip-2"],
  type: "Vpn",
  vpnType: "RouteBased",
  sku: "VpnGw1",
  azureAsn: 65515,
  vpnConnectionType: "IPsec",
  pipAlloc: "Dynamic",
  retentionInDays: 30,
};

export const azureAwsVpnparams = {
  conneectDestination: "aws",
  azureAwsGwIp1ip1: "169.254.21.1",
  azureAwsGwIp1ip2: "169.254.21.5",
  azureAwsGwIp2ip1: "169.254.22.1",
  azureAwsGwIp2ip2: "169.254.22.5",
  awsGwIp1Cidr: ["169.254.21.0/30", "169.254.22.0/30"],
  awsGwIp2Cidr: ["169.254.21.4/30", "169.254.22.4/30"],
  awsGwIp1ip1: "169.254.21.2",
  awsGwIp1ip2: "169.254.21.6",
  awsGwIp2ip1: "169.254.22.2",
  awsGwIp2ip2: "169.254.22.6",
};
export const azureGoogleVpnparams = {
  conneectDestination: "google",
  googleGwIp1: "169.254.21.9",
  googleGwIp2: "169.254.22.9",
  googlePeerIp1: "169.254.21.10",
  googlePeerIp2: "169.254.22.10",
  presharedKey: "test#01",
};

export const azureVpnGatewayParams = {
  resourceGroupName: resourceGroup,
  virtualNetworkName: vnetName,
  VpnGatewayName: `${vnetName}-vng`,
  gatewaySubnetCidr: azureVpnparams.gatewaySubnetCidr,
  publicIpNames: azureVpnparams.publicIpNames,
  location: azureCommonparams.location,
  vpnProps: {
    type: azureVpnparams.type,
    vpnType: azureVpnparams.vpnType,
    sku: azureVpnparams.sku,
    azureAsn: azureVpnparams.azureAsn,
    pipAlloc: azureVpnparams.pipAlloc,
    awsGwIp1ip1: azureAwsVpnparams.awsGwIp1ip1,
    awsGwIp1ip2: azureAwsVpnparams.awsGwIp1ip2,
    awsGwIp2ip1: azureAwsVpnparams.awsGwIp2ip1,
    awsGwIp2ip2: azureAwsVpnparams.awsGwIp2ip2,
    googleGWip1: azureGoogleVpnparams.googleGwIp1,
    googleGWip2: azureGoogleVpnparams.googleGwIp2,
    googlePeerIp1: azureGoogleVpnparams.googlePeerIp1,
    googlePeerIp2: azureGoogleVpnparams.googlePeerIp2,
  },
  diagnosticSettings: {
    retentionInDays: azureVpnparams.retentionInDays,
  },
};

export const createLocalGatewayParams = (
  virtualNetworkGatewayId: string,
  conneectDestination: string,
  tunnels: Array<any>,
  isSingleTunnel: boolean
) => ({
  resourceGroupName: azureCommonparams.resourceGroup,
  location: azureCommonparams.location,
  conneectDestination: conneectDestination,
  virtualNetworkGatewayId: virtualNetworkGatewayId,
  vpnConnectionType: azureVpnparams.vpnConnectionType,
  tunnels: tunnels,
  isSingleTunnel: isSingleTunnel,
});

/* AzureVM */
export const vmBuilding = true;
export const azureVmsConfigparams = [
  {
    name: "example-vm-1",
    resourceGroupName: resourceGroup,
    location: location,
    size: "Standard_B1ls",
    adminUsername: "azureuser",
    osDisk: {
      caching: "ReadWrite",
      storageAccountType: "Standard_LRS",
    },
    sourceImageReference: {
      publisher: "Canonical",
      offer: "ubuntu-24_04-lts",
      sku: "server",
      version: "latest",
    },
  },
  // {
  //   name: 'example-vm-2',
  //   resourceGroupName: 'rg_multicloud',
  //   location: 'Japan East',
  //   size: 'Standard_B1ls',
  //   adminUsername: 'azureuser',
  //   osDisk: {
  //     caching: 'ReadWrite',
  //     storageAccountType: 'Standard_LRS',
  //   },
  //   sourceImageReference: {
  //     publisher: 'Canonical',
  //     offer: 'ubuntu-24_04-lts',
  //     sku: 'server',
  //     version: 'latest',
  //   },
  // },
];
