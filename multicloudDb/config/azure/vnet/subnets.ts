export const subnets = [
  {
    name: "web-subnet",
    cidr: "10.2.10.0/24",
  },
  {
    name: "app-subnet",
    cidr: "10.2.20.0/24",
  },
  {
    name: "db-mysql-subnet",
    cidr: "10.2.31.0/24",
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
    delegations: [
      {
        name: "Microsoft.DBforPostgreSQL-flexibleServers",
        serviceName: "Microsoft.DBforPostgreSQL/flexibleServers",
      },
    ],
  },
];

export const bastionSubnetcidr = "10.2.110.0/24";
