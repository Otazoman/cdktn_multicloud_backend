// ---------------------------------------------------------------------------
// VPN address plan (HA / BGP)
//
// BGP inside addresses (APIPA, 169.254.0.0/16) for each cloud pair, in one
// place. Each tunnel uses one /30 with one address per side.
//
// Rules (checked by __tests__/addressPlan.test.ts):
//   - Both addresses of a tunnel are host addresses of its /30.
//   - /30 ranges do not overlap across all pairs.
//   - Azure-side addresses are within 169.254.21.0 - 169.254.22.255
//     (Azure custom APIPA range).
//
// AWS <-> Google uses the inside addresses assigned by AWS, so it has no
// entry here. ASNs are set per cloud in config/<cloud>/vpn.ts.
// ---------------------------------------------------------------------------

export interface AwsAzureTunnelAddress {
  insideCidr: string;
  awsIp: string;
  azureIp: string;
}

export interface GoogleAzureTunnelAddress {
  /** Not passed to any resource; documents the /30 and is validated */
  insideCidr: string;
  googleIp: string;
  azureIp: string;
}

export const vpnAddressPlan = {
  // AWS <-> Azure
  //   tunnels[i][t]: Azure VPN gateway instance i (= AWS VPN connection i),
  //   AWS tunnel t (tunnel1, tunnel2).
  awsAzure: {
    tunnels: [
      [
        {
          insideCidr: "169.254.21.0/30",
          awsIp: "169.254.21.1",
          azureIp: "169.254.21.2",
        },
        {
          insideCidr: "169.254.21.4/30",
          awsIp: "169.254.21.5",
          azureIp: "169.254.21.6",
        },
      ],
      [
        {
          insideCidr: "169.254.22.0/30",
          awsIp: "169.254.22.1",
          azureIp: "169.254.22.2",
        },
        {
          insideCidr: "169.254.22.4/30",
          awsIp: "169.254.22.5",
          azureIp: "169.254.22.6",
        },
      ],
    ] as AwsAzureTunnelAddress[][],
  },

  // Google <-> Azure
  //   tunnels[i]: Azure VPN gateway instance i (= Google HA VPN interface i).
  googleAzure: {
    tunnels: [
      {
        insideCidr: "169.254.21.8/30",
        googleIp: "169.254.21.10",
        azureIp: "169.254.21.9",
      },
      {
        insideCidr: "169.254.22.8/30",
        googleIp: "169.254.22.10",
        azureIp: "169.254.22.9",
      },
    ] as GoogleAzureTunnelAddress[],
    presharedKey: process.env.GOOGLE_AZURE_VPN_PRESHARED_KEY!,
  },
};
