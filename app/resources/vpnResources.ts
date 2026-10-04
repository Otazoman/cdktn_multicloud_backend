import { awsVpnparams } from "../config/aws/awssettings";
import {
  azureCommonparams,
  azureVpnparams,
} from "../config/azure/azuresettings";
import { googleVpnParams } from "../config/google/googlesettings";
import { createAwsVpnGateway } from "../constructs/vpnnetwork/awsvpngw";
import { createAzureVpnGateway } from "../constructs/vpnnetwork/azurevpngw";
import { createGoogleVpnGateway } from "../constructs/vpnnetwork/googlevpngw";

import { env } from "../config/commonsettings";
import { isCloudConnected, isConnected } from "../config/connections";
import { CloudContext } from "../clouds/types";
import { resourceName } from "../utils/naming";
import {
  AzureResourcesOutput,
  AzureVnetResources,
} from "../clouds/azure/types";
import { VpnResources } from "./vpn/types";
import { setupAwsToAzureVpn } from "./vpn/awsAzureVpn";
import { azureVngApipaAddresses } from "./vpn/helpers";
import { setupAwsToGoogleVpn } from "./vpn/awsGoogleVpn";
import { setupGoogleToAzureVpn } from "./vpn/googleAzureVpn";

/**
 * ---------------------------------------------------------------------------
 * How to add a new cloud provider
 * ---------------------------------------------------------------------------
 * This module wires up VPN connectivity between pairs of clouds (AWS, Google,
 * Azure today). VPN peering is inherently pairwise - each pair of clouds has
 * its own connection logic - so adding a new cloud "NewCloud" means adding
 * one connection per existing cloud it should peer with (NewCloud<->AWS,
 * NewCloud<->Google, NewCloud<->Azure, ...). There is no way around writing
 * that pairwise logic, but the code is structured to make each addition as
 * small and mechanical as possible:
 *
 *   - This file (entry point): hub gateways and the ordered list of
 *     pairwise connection steps.
 *   - `vpn/<cloud><Cloud>Vpn.ts`: one module per cloud pair
 *     (`awsGoogleVpn.ts`, `awsAzureVpn.ts`, `googleAzureVpn.ts`).
 *   - `vpn/helpers.ts`: constants and helpers shared by the pair modules.
 *
 *   1. If NewCloud needs a long-lived "hub" gateway resource (like the AWS
 *      VGW, Google VPN Gateway, or Azure VNG below), add one entry to the
 *      `hubGatewaySteps` array inside createVpnResources().
 *   2. For each existing cloud NewCloud should connect to, add a
 *      `vpn/<cloud>NewCloudVpn.ts` module exporting a
 *      `setup<Cloud>To<NewCloud>Vpn(...)` function, following the existing
 *      `setupAwsToGoogleVpn` / `setupAwsToAzureVpn` / `setupGoogleToAzureVpn`
 *      modules as templates. Reuse the shared helpers in `vpn/helpers.ts`
 *      (getCloudRouter, getForwardingRuleResources, getVpnGatewayIpAddresses,
 *      extractAwsVpnTunnels, setupGoogleVpnTunnels, getCgwLogGroupArn)
 *      wherever the new cloud's SDK shape matches - most of the AWS- and
 *      Google-side plumbing is already generic.
 *   3. Import the new function here and register it as one entry in the
 *      `pairwiseConnectionSteps` array inside createVpnResources(), with its
 *      own enable condition.
 *   4. For HA (BGP), add the pair's inside addresses to
 *      config/vpn/addressPlan.ts (validated by __tests__/addressPlan.test.ts).
 *      If the pair connects to Azure, also add one entry to
 *      AZURE_APIPA_SOURCES in vpn/helpers.ts so that the Azure VPN gateway
 *      owns the pair's Azure-side addresses.
 *
 * Every pair setup function has the same signature
 * `(ctx: CloudContext, resources: VpnResources, isSingleTunnel: boolean)`.
 *
 * Design rule for cross-cutting data (e.g. a CloudWatch Log Group ARN, a Log
 * Analytics Workspace ID): read it from `ctx.outputs.<cloud>` inside the
 * function that actually needs it. Don't extract it at the call site and pass
 * the derived value down - that pattern grows the parameter list of every
 * step in `createVpnResources` every time a new piece of cross-cutting data is
 * needed, even though only one function two levels down actually cares
 * about it.
 *
 * Nothing outside `hubGatewaySteps` / `pairwiseConnectionSteps` should need to
 * change to add a new pair.
 * ---------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Azure VPN Gateway config
//
// Takes the full Azure orchestrator output (rather than pre-extracted
// values) and derives everything it needs from it and from
// `azureVnetResources` internally. This keeps the call site in
// createVpnResources() from having to know about
// `monitorResources.logAnalyticsWorkspace.id` or `lastSubnet` - those are
// this function's concern, not the orchestrator's.
// ---------------------------------------------------------------------------

function createAzureVpnGatewayConfig(
  azureVnetResources: AzureVnetResources,
  isSingleTunnel: boolean,
  azureResourcesOutput: AzureResourcesOutput | undefined,
) {
  const logAnalyticsWorkspaceId =
    azureResourcesOutput?.monitorResources?.logAnalyticsWorkspace?.id;
  const vnetDependencies = azureVnetResources.lastSubnet
    ? [azureVnetResources.lastSubnet]
    : undefined;

  return {
    resourceGroupName: azureCommonparams.resourceGroup,
    virtualNetworkName: azureVnetResources.vnet.name,
    VpnGatewayName: azureVpnparams.vpnGatewayName,
    gatewaySubnetCidr: azureVpnparams.gatewaySubnetCidr,
    publicIpNames: azureVpnparams.publicIpNames,
    ipConfigurationNames: azureVpnparams.ipConfigurationNames,
    diagnosticSettingName: azureVpnparams.diagnosticSettingName,
    location: azureCommonparams.location,
    vpnProps: {
      type: azureVpnparams.type,
      vpnType: azureVpnparams.vpnType,
      sku: azureVpnparams.sku,
      azureAsn: azureVpnparams.azureAsn,
      pipAlloc: azureVpnparams.pipAlloc,
    },
    // Azure-side BGP addresses of every enabled pair (config/vpn/addressPlan.ts)
    apipaAddresses: azureVngApipaAddresses(),
    diagnosticSettings: {
      retentionInDays: azureVpnparams.retentionInDays,
    },
    isSingleTunnel,
    publicIpZones: azureVpnparams.publicIpZones,
    tags: azureVpnparams.vpnGwtags,
    logAnalyticsWorkspaceId,
    vnetDependencies,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function createVpnResources(ctx: CloudContext): VpnResources {
  const { scope, providers } = ctx;
  const awsProvider = providers.aws;
  const googleProvider = providers.google;
  const azureProvider = providers.azure;
  const awsVpcResources = ctx.outputs.aws.vpc;
  const googleVpcResources = ctx.outputs.google.vpc;
  const azureVnetResources = ctx.outputs.azure.vpc;
  // Full Azure orchestrator output (Log Analytics Workspace ID and
  // lastSubnet are used by createAzureVpnGatewayConfig).
  const azureResourcesOutput = ctx.outputs.azure;

  const resources: VpnResources = { gateways: {}, connections: {} };
  const isSingleTunnel = env === "dev";

  // ---------------------------------------------------------------------
  // Step 1: create each cloud's "hub" gateway resource, if that cloud
  // participates in at least one enabled connection.
  //
  // To add a new cloud that needs its own hub gateway, append one entry
  // here. `shouldCreate` decides whether the gateway is needed at all;
  // `create` performs the actual construct call and stores the result on
  // `resources`.
  // ---------------------------------------------------------------------
  const hubGatewaySteps: Array<{
    shouldCreate: () => boolean;
    create: () => void;
  }> = [
    {
      // AWS Virtual Private Gateway - needed whenever AWS peers with anything.
      shouldCreate: () => isCloudConnected("aws") && !!awsVpcResources,
      create: () => {
        resources.gateways.aws = createAwsVpnGateway(scope, awsProvider, {
          vpcId: awsVpcResources!.vpc.id,
          amazonSideAsn: awsVpnparams.bgpAwsAsn,
          vgwName: resourceName(awsVpnparams.vpnGatewayName, "aws", "vgw"),
          routeTableIds: [
            awsVpcResources!.publicRouteTable.id,
            awsVpcResources!.privateRouteTable.id,
          ],
          tags: awsVpnparams.vpnGatewayTags,
        });
      },
    },
    {
      // Google VPN Gateway (Single Tunnel and HA VPN) - needed whenever
      // Google peers with anything.
      shouldCreate: () =>
        isCloudConnected("google") &&
        !!googleVpcResources &&
        !resources.gateways.google,
      create: () => {
        // Custom IP ranges are only meaningful for HA VPN, and only when
        // configured.
        const shouldUseCustomIpRanges =
          !isSingleTunnel &&
          googleVpnParams.customIpRanges &&
          googleVpnParams.customIpRanges.length > 0;

        resources.gateways.google = createGoogleVpnGateway(
          scope,
          googleProvider,
          {
            vpcNetwork: googleVpcResources!.vpc.name,
            connectDestination: googleVpnParams.connectDestination,
            vpnGatewayName: googleVpnParams.vpnGatewayName,
            gatewayIpName: googleVpnParams.gatewayIpName,
            forwardingRuleNames: googleVpnParams.forwardingRuleNames,
            haIpNames: googleVpnParams.haIpNames,
            cloudRouterName: googleVpnParams.cloudRouterName,
            bgpGoogleAsn: googleVpnParams.bgpGoogleAsn,
            isSingleTunnel,
            ...(shouldUseCustomIpRanges && {
              customIpRanges: googleVpnParams.customIpRanges,
            }),
            labels: googleVpnParams.labels,
          },
        );
      },
    },
    {
      // Azure Virtual Network Gateway - needed whenever Azure peers with
      // anything.
      shouldCreate: () =>
        isCloudConnected("azure") && !!azureVnetResources,
      create: () => {
        const azureVpnResult = createAzureVpnGateway(
          scope,
          azureProvider,
          createAzureVpnGatewayConfig(
            azureVnetResources!,
            isSingleTunnel,
            azureResourcesOutput,
          ),
        );
        // Includes the gateway subnet, used by the DNS Private Resolver
        // dependency in privateZoneResources.ts.
        resources.gateways.azure = azureVpnResult;
      },
    },
  ];

  for (const step of hubGatewaySteps) {
    if (step.shouldCreate()) {
      step.create();
    }
  }

  // ---------------------------------------------------------------------
  // Step 2: set up each pairwise VPN connection that is enabled.
  //
  // To add a new pair (e.g. NewCloud <-> AWS), write a
  // `setupAwsToNewCloudVpn(...)` function in `vpn/awsNewCloudVpn.ts`,
  // following the existing `setup<Cloud>To<Cloud>Vpn` modules as a template,
  // then import it here and append one entry with its own enable condition.
  // The order of this array is the order the connections are provisioned in,
  // matching the order used
  // before this refactor (AWS-Google, then AWS-Azure, then Google-Azure).
  // ---------------------------------------------------------------------
  const pairwiseConnectionSteps: Array<{
    shouldRun: () => boolean;
    run: () => void;
  }> = [
    {
      shouldRun: () =>
        Boolean(
          isConnected("aws", "google") && awsVpcResources && googleVpcResources,
        ),
      run: () =>
        setupAwsToGoogleVpn(ctx, resources, isSingleTunnel),
    },
    {
      shouldRun: () =>
        Boolean(
          isConnected("aws", "azure") && awsVpcResources && azureVnetResources,
        ),
      run: () =>
        setupAwsToAzureVpn(ctx, resources, isSingleTunnel),
    },
    {
      shouldRun: () =>
        Boolean(
          isConnected("google", "azure") &&
            googleVpcResources &&
            azureVnetResources,
        ),
      run: () =>
        setupGoogleToAzureVpn(ctx, resources, isSingleTunnel),
    },
  ];

  for (const step of pairwiseConnectionSteps) {
    if (step.shouldRun()) {
      step.run();
    }
  }

  return resources;
}
