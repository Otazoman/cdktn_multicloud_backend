import { CustomerGateway } from "@cdktn/provider-aws/lib/customer-gateway";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { VpnConnection } from "@cdktn/provider-aws/lib/vpn-connection";
import { Construct } from "constructs";
import { resourceName } from "../../utils/naming";

interface CustomerGatewayParams {
  /** Names in creation order. Missing entries use the default name */
  customerGatewayNames: string[];
  vpnConnectionNames: string[];
  connectDestination: string;
  awsVpnCgwProps: {
    bgpAsn: number;
    type: string;
  };
  vpnGatewayId: string;
  awsVpnGatewayIpAddresses: string[];
  azureVpnProps?: {
    awsGwIpCidr1: string[];
    awsGwIpCidr2: string[];
  };
  // ARN of the CloudWatch Log Group created up-front (before this
  // construct runs) so that the whole stack, including logs, can be
  // destroyed by CDKTN as a single unit.
  logGroupArn: string;
  isSingleTunnel: boolean;
  tags?: { [key: string]: string };
}

export function createAwsCustomerGateway(
  scope: Construct,
  provider: AwsProvider,
  params: CustomerGatewayParams,
) {
  const awscGwVpncons = params.awsVpnGatewayIpAddresses.map(
    (ipAddress, index) => {
      // Create CustomerGateway
      const cgw = new CustomerGateway(
        scope,
        `aws_${params.connectDestination}_cgw_${index}`,
        {
          provider: provider,
          bgpAsn: params.awsVpnCgwProps.bgpAsn.toString(),
          ipAddress: ipAddress,
          type: params.awsVpnCgwProps.type,
          tags: {
            Name: resourceName(
              params.customerGatewayNames[index],
              "aws",
              "cgw",
              `${params.connectDestination}-${index + 1}`,
            ),
            ...(params.tags || {}),
          },
        },
      );

      // Common Options
      const commonVpnOptions = {
        provider: provider,
        vpnGatewayId: params.vpnGatewayId,
        customerGatewayId: cgw.id,
        type: params.awsVpnCgwProps.type,
        staticRoutesOnly: params.isSingleTunnel,
        tunnel1LogOptions: {
          cloudwatchLogOptions: {
            logEnabled: true,
            logGroupArn: params.logGroupArn,
            logOutputFormat: "text",
          },
        },
        tunnel2LogOptions: {
          cloudwatchLogOptions: {
            logEnabled: true,
            logGroupArn: params.logGroupArn,
            logOutputFormat: "text",
          },
        },
        tags: {
          Name: resourceName(
            params.vpnConnectionNames[index],
            "aws",
            "vpn-connection",
            `${params.connectDestination}-${index + 1}`,
          ),
          ...(params.tags || {}),
        },
      };

      // Create VPN Connection
      let vpncon;
      if (params.connectDestination === "google") {
        vpncon = new VpnConnection(
          scope,
          `aws_${params.connectDestination}_vpn_connection_${index}`,
          {
            ...commonVpnOptions,
          },
        );
      } else if (params.connectDestination === "azure") {
        if (!params.azureVpnProps) {
          throw new Error(
            "Azure VPN properties are required when connecting to Azure",
          );
        }
        vpncon = new VpnConnection(
          scope,
          `aws_${params.connectDestination}_vpn_connection_${index}`,
          {
            ...commonVpnOptions,
            tunnel1InsideCidr: params.azureVpnProps.awsGwIpCidr1[index],
            tunnel2InsideCidr: params.azureVpnProps.awsGwIpCidr2[index],
          },
        );
      }

      return { customerGateway: cgw, vpnConnection: vpncon };
    },
  );

  return awscGwVpncons;
}
