/* VPC configuration parameters */
const vpcName = "my-gcp-vpc";

export const googleVpcResourcesparams = {
  vpcName: vpcName,
  vpcCidrblock: "10.1.0.0/16",
  vpcLabels: {
    Environment: "Development",
    Project: "MultiCloud",
  },
  subnets: [
    {
      name: "subnet1",
      cidr: "10.1.10.0/24",
      region: "asia-northeast1",
      labels: {
        Tier: "Web",
      },
    },
    {
      name: "subnet2",
      cidr: "10.1.20.0/24",
      region: "asia-northeast1",
      labels: {
        Tier: "App",
      },
    },
  ],
  firewallIngressRules: [
    {
      name: "google-ssh-allow-rule",
      permission: {
        protocol: "tcp",
        ports: ["22"],
      },
      sourceRanges: ["35.235.240.0/20"],
      priority: 1000,
    },
    {
      name: "internal-aws-rule",
      permission: {
        protocol: "all",
      },
      sourceRanges: ["10.0.0.0/16"],
      priority: 1000,
    },
    {
      name: "internal-google-rule",
      permission: {
        protocol: "all",
      },
      sourceRanges: ["10.1.0.0/16"],
      priority: 1000,
    },
    {
      name: "internal-azure-rule",
      permission: {
        protocol: "all",
      },
      sourceRanges: ["10.2.0.0/16"],
      priority: 1000,
    },
  ],
  firewallEgressRules: [
    {
      name: "vpn-rule",
      permission: {
        protocol: "all",
      },
      sourceRanges: ["0.0.0.0/0"],
      destinationRanges: ["0.0.0.0/0"],
      priority: 1000,
    },
  ],
  natConfig: {
    enable: false,
    name: "google-nat-gateway",
    region: "asia-northeast1",
    routerName: "natgateway-router",
  },
};
/* VPN configuration parameters */
export const googleVpnParams = {
  connectDestination: "common",
  vpnGatewayName: "google-vpn-gateway",
  cloudRouterName: "google-cloud-router",
  bgpGoogleAsn: 65000,
  ikeVersion: 2,
  labels: {
    owner: "team-a",
  },
};

export const createGoogleVpnPeerParams = (
  connectDestination: string,
  tunnelCount: number,
  ikeVersion: number,
  cloudRouter: any,
  vpnGateway: any,
  externalVpnGateway: any,
  vpnConnections: any,
  isSingleTunnel: boolean,
  gcpVpcCidr: string,
  peerVpcCidr: string,
  gcpNetwork: string,
  forwardingRuleResources: any,
  labels?: { [key: string]: string } | undefined
) => ({
  connectDestination: connectDestination,
  vpnTnnelname: `${vpcName}-gcp-${connectDestination}-vpn-tunnel`,
  routerInterfaceName: `${vpcName}-gcp-${connectDestination}-router-interface`,
  routerPeerName: `${vpcName}-gcp-${connectDestination}-router-peer`,
  tunnelCount: tunnelCount,
  ikeVersion: ikeVersion,
  routerName: cloudRouter?.name || "",
  cloudRouter: cloudRouter,
  vpnGateway: vpnGateway,
  externalVpnGateway: externalVpnGateway,
  vpnConnections: vpnConnections,
  isSingleTunnel: isSingleTunnel,
  gcpVpcCidr: gcpVpcCidr,
  peerVpcCidr: peerVpcCidr,
  gcpNetwork: gcpNetwork,
  forwardingRuleResources: forwardingRuleResources,
  labels: labels,
});

/* GCE instance configurations */
const serviceAccountScopes = [
  "https://www.googleapis.com/auth/devstorage.read_only",
  "https://www.googleapis.com/auth/logging.write",
  "https://www.googleapis.com/auth/monitoring.write",
  "https://www.googleapis.com/auth/servicecontrol",
  "https://www.googleapis.com/auth/service.management.readonly",
  "https://www.googleapis.com/auth/trace.append",
];

export const gceInstancesParams = {
  project: "multicloud-sitevpn-project",
  instanceConfigs: [
    {
      name: "gce-instance-1",
      machineType: "e2-micro",
      zone: "asia-northeast1-a",
      tags: ["multicloud"],
      labels: {
        name: "example-instance1",
        owner: "team-a",
      },
      bootDiskImage:
        "projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20240701a",
      bootDiskSize: 10,
      bootDiskType: "pd-standard",
      bootDiskDeviceName: "test-instance1-boot-disk",
      subnetworkName: "subnet1",
      serviceAccountScopes: serviceAccountScopes,
      build: true,
    },
    {
      name: "gce-instance-2",
      machineType: "e2-micro",
      zone: "asia-northeast1-b",
      tags: ["multicloud"],
      labels: {
        name: "example-instance2",
        owner: "team-a",
      },
      bootDiskImage:
        "projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20240701a",
      bootDiskSize: 20,
      bootDiskType: "pd-standard",
      bootDiskDeviceName: "test-instance2-boot-disk",
      subnetworkName: "subnet2",
      serviceAccountScopes: serviceAccountScopes,
      build: false,
    },
  ],
  vpcName: vpcName,
};
