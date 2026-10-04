# VPN

## Modes

| `env` | Tunnels | Routing |
|---|---|---|
| `dev` | One tunnel per peer gateway (Google Classic VPN, Azure active-standby) | Static routes |
| `prod` | HA: AWS VGW (2 tunnels per connection), Google HA VPN (2 interfaces), Azure VPN Gateway active-active (2 instances) | BGP |

## Topologies

Each pair flag creates a **direct** connection:

| Flags | Result |
|---|---|
| All three | Full mesh |
| Two of them (e.g. `awsToAzure` + `googleToAzure`) | The shared cloud (Azure) is a hub. The Azure VPN Gateway re-advertises routes learned from one BGP peer to the others, so AWS and Google reach each other through Azure (`prod` only) |
| One | That pair only |

## Code structure

| File | Role |
|---|---|
| `resources/vpnResources.ts` | Creates the hub gateway of each participating cloud (`hubGatewaySteps`), then runs each enabled pair (`pairwiseConnectionSteps`) |
| `resources/vpn/awsGoogleVpn.ts`, `awsAzureVpn.ts`, `googleAzureVpn.ts` | One module per pair, all with the signature `(ctx: CloudContext, resources: VpnResources, isSingleTunnel: boolean)` |
| `resources/vpn/helpers.ts` | Shared helpers, including `azureVngApipaAddresses()` |
| `config/vpn/addressPlan.ts` | BGP inside addresses (APIPA) and the Google–Azure pre-shared key |
| `config/<cloud>/vpn.ts` | Per-cloud gateway settings, ASNs and resource names |

ASNs: AWS 64512, Google Cloud 65000, Azure 65515.

## BGP inside addresses (prod)

Each tunnel uses a /30 with one address per side, defined in
`config/vpn/addressPlan.ts`:

| Pair | Layout |
|---|---|
| AWS–Azure | `tunnels[i][t]`: Azure gateway instance `i` (= AWS VPN connection `i`), AWS tunnel `t` |
| Google–Azure | `tunnels[i]`: Azure gateway instance `i` (= Google HA VPN interface `i`) |

AWS–Google uses the inside addresses assigned by AWS.

Rules (checked by `__tests__/addressPlan.test.ts`): both addresses are host
addresses of their /30, ranges do not overlap, and Azure-side addresses are
within 169.254.21.0–169.254.22.255.

## Things that must hold for the hub topology to work

These were the root causes of route propagation failures when Azure was the
hub, and are now enforced by the code and tests:

1. **Azure connections must pin their APIPA address.** The Azure VPN Gateway
   owns several custom APIPA addresses per instance (one per AWS tunnel and one
   for Google). Each connection sets `custom_bgp_addresses` (primary: instance
   1, secondary: instance 2). Without it, Azure uses the first APIPA address
   for every connection and the BGP sessions with Google never come up
   ([Microsoft docs](https://learn.microsoft.com/azure/vpn-gateway/vpn-gateway-howto-aws-bgp)).
2. **Each Google HA tunnel must terminate on the Azure instance that owns its
   BGP address.** Tunnel `i` targets Azure public IP `i`, and its BGP peer is
   `tunnels[i].azureIp` on the same instance.
3. **The Azure gateway must own the Azure-side address of every enabled pair.**
   `azureVngApipaAddresses()` collects them from the enabled pairs
   (`AZURE_APIPA_SOURCES`).

Note: with a direct AWS–Google connection, AWS VPN CloudHub can re-advertise
routes between Azure and Google through the AWS VGW, which can hide a broken
Azure–Google BGP session.

## Checking BGP after deploy

- Azure Portal: VPN Gateway → BGP peers (all peers Connected) and learned routes
- Google Cloud Console: Cloud Router → BGP sessions (Established) and learned routes
- AWS: route tables with VGW route propagation contain the peer CIDRs

Also allow the peer CIDRs in security groups, NSGs and Google Cloud firewall rules.
