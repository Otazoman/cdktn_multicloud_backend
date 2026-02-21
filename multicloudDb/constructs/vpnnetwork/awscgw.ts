import { CloudwatchLogGroup } from "@cdktn/provider-aws/lib/cloudwatch-log-group";
import { CustomerGateway } from "@cdktn/provider-aws/lib/customer-gateway";
import { AwsProvider } from "@cdktn/provider-aws/lib/provider";
import { VpnConnection } from "@cdktn/provider-aws/lib/vpn-connection";
import { Construct } from "constructs";

interface CustomerGatewayParams {
  customerGatewayName: string;
  vpnConnectionName: string;
  conneectDestination: string;
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
  logRetentionDays: number;
  isSingleTunnel: boolean;
  tags?: { [key: string]: string };
}

export function createAwsCustomerGateway(
  scope: Construct,
  provider: AwsProvider,
  params: CustomerGatewayParams
) {
  // Create CloudWatch Logs loggroup
  const logGroup = new CloudwatchLogGroup(
    scope,
    `${params.customerGatewayName}-log-group`,
    {
      provider: provider,
      name: `${params.customerGatewayName}-log-group`,
      retentionInDays: params.logRetentionDays,
    }
  );

  const awscGwVpncons = params.awsVpnGatewayIpAddresses.map(
    (ipAddress, index) => {
      // Create CustomerGateway
      const cgw = new CustomerGateway(
        scope,
        `aws_${params.conneectDestination}_cgw_${index}`,
        {
          provider: provider,
          bgpAsn: params.awsVpnCgwProps.bgpAsn.toString(),
          ipAddress: ipAddress,
          type: params.awsVpnCgwProps.type,
          tags: {
            Name: `${params.customerGatewayName}-${index + 1}`,
            ...(params.tags || {}),
          },
        }
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
            logGroupArn: logGroup.arn,
            logOutputFormat: "text",
          },
        },
        tunnel2LogOptions: {
          cloudwatchLogOptions: {
            logEnabled: true,
            logGroupArn: logGroup.arn,
            logOutputFormat: "text",
          },
        },
        tags: {
          Name: `${params.vpnConnectionName}-${index + 1}`,
          ...(params.tags || {}),
        },
      };

      // Create VPN Connection
      let vpncon;
      if (params.conneectDestination === "google") {
        vpncon = new VpnConnection(
          scope,
          `aws_${params.conneectDestination}_vpn_connection_${index}`,
          {
            ...commonVpnOptions,
          }
        );
      } else if (params.conneectDestination === "azure") {
        if (!params.azureVpnProps) {
          throw new Error(
            "Azure VPN properties are required when connecting to Azure"
          );
        }
        vpncon = new VpnConnection(
          scope,
          `aws_${params.conneectDestination}_vpn_connection_${index}`,
          {
            ...commonVpnOptions,
            tunnel1InsideCidr: params.azureVpnProps.awsGwIpCidr1[index],
            tunnel2InsideCidr: params.azureVpnProps.awsGwIpCidr2[index],
          }
        );
      }

      return { customerGateway: cgw, vpnConnection: vpncon };
    }
  );

  return awscGwVpncons;
}
