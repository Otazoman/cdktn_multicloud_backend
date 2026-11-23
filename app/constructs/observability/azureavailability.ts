import { ApplicationInsights } from "@cdktn/provider-azurerm/lib/application-insights";
import { ApplicationInsightsStandardWebTest } from "@cdktn/provider-azurerm/lib/application-insights-standard-web-test";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { Construct } from "constructs";

/**
 * Availability (uptime) tests of HTTP(S) endpoints from Azure's test
 * locations on the internet: an Application Insights resource (workspace
 * based) and one standard web test per endpoint. Alert on them with a
 * metric alert's webTestAvailability (constructs/observability/azuremonitor.ts).
 */
export interface AzureAvailabilityTestsParams {
  resourceGroupName: string;
  location: string;
  applicationInsightsName: string;
  /** Log Analytics Workspace the Application Insights data goes to */
  workspaceId: string;
  /** Test locations (population tags, e.g. "apac-jp-kaw-edge" for Japan East) */
  geoLocations: string[];
  /** Seconds between tests: 300, 600 or 900 */
  frequency: number;
  /** Seconds, default 30 */
  timeout?: number;
  tests: {
    /** Construct ID key and test name */
    name: string;
    url: string;
  }[];
  tags?: { [key: string]: string };
}

export interface AzureAvailabilityTests {
  applicationInsights: ApplicationInsights;
  webTests: Record<string, ApplicationInsightsStandardWebTest>;
}

export function createAzureAvailabilityTests(
  scope: Construct,
  provider: AzurermProvider,
  params: AzureAvailabilityTestsParams,
): AzureAvailabilityTests {
  const applicationInsights = new ApplicationInsights(scope, "azure-app-insights", {
    provider,
    name: params.applicationInsightsName,
    resourceGroupName: params.resourceGroupName,
    location: params.location,
    applicationType: "web",
    workspaceId: params.workspaceId,
    tags: params.tags,
  });

  const webTests: Record<string, ApplicationInsightsStandardWebTest> = {};
  params.tests.forEach((test) => {
    webTests[test.name] = new ApplicationInsightsStandardWebTest(
      scope,
      `azure-web-test-${test.name}`,
      {
        provider,
        name: test.name,
        resourceGroupName: params.resourceGroupName,
        // Must be the location of the Application Insights resource
        location: params.location,
        applicationInsightsId: applicationInsights.id,
        geoLocations: params.geoLocations,
        frequency: params.frequency,
        timeout: params.timeout,
        enabled: true,
        request: { url: test.url },
        // The address may be an IP (no public DNS): the certificate is not
        // checked, only the answer (200)
        validationRules: { expectedStatusCode: 200, sslCheckEnabled: false },
        tags: params.tags,
        // Azure adds a hidden-link tag to the test
        lifecycle: { ignoreChanges: ["tags"] },
      },
    );
  });

  return { applicationInsights, webTests };
}
