export const subnets = [
  {
    name: "web-subnet",
    cidr: "10.2.10.0/24",
    // Associate with NAT Gateway for outbound internet access
    natGatewayEnabled: true,
  },
  {
    name: "web-appgw-subnet",
    cidr: "10.2.11.0/24",
    natGatewayEnabled: true,
  },
  {
    name: "app-subnet",
    cidr: "10.2.20.0/24",
    // VMs reside here — NAT Gateway required for outbound internet access
    natGatewayEnabled: true,
  },
  {
    // Subnet for Azure Files Private Endpoints only.
    // privateEndpointNetworkPoliciesEnabled must be false for Private Endpoints.
    //
    // IMPORTANT: natGatewayEnabled must be false for this subnet.
    // Azure known limitation (https://learn.microsoft.com/azure/private-link/private-endpoint-overview#limitations):
    // Associating a NAT Gateway with a subnet that has privateEndpointNetworkPolicies "Disabled"
    // rewrites VNet system routes and breaks reachability to link-local addresses
    // 168.63.129.16 (Azure DNS) and 169.254.169.254 (Azure IMDS) for ALL VMs in the VNet.
    // This causes Bastion, SSH, WALinuxAgent, and sudo hostname resolution to fail across the VNet.
    name: "storage-subnet",
    cidr: "10.2.40.0/24",
    privateEndpointNetworkPoliciesEnabled: false,
    natGatewayEnabled: false,
  },
  {
    name: "db-mysql-subnet",
    cidr: "10.2.31.0/24",
    // Delegated subnets cannot have NAT Gateway associated —
    // Azure does not support NAT Gateway on subnets delegated to managed PaaS services.
    natGatewayEnabled: false,
    delegations: [
      {
        name: "Microsoft.DBforMySQL-flexibleServers",
        serviceName: "Microsoft.DBforMySQL/flexibleServers",
      },
    ],
  },
  {
    name: "db-postgres-subnet",
    cidr: "10.2.32.0/24",
    natGatewayEnabled: false,
    delegations: [
      {
        name: "Microsoft.DBforPostgreSQL-flexibleServers",
        serviceName: "Microsoft.DBforPostgreSQL/flexibleServers",
      },
    ],
  },
];

export const bastionSubnetcidr = "10.2.110.0/24";
