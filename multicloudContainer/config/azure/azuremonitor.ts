import { LOCATION, RESOURCE_GROUP } from "./common";

/**
 * Azure Monitor configuration for Log Analytics Workspace and Diagnostic Settings.
 * This serves as the central config for monitoring resources across all Azure services.
 */
export const azureMonitorConfig = {
  isEnabled: true,
  resourceGroupName: RESOURCE_GROUP,
  location: LOCATION,
  logAnalyticsWorkspace: {
    name: "log-workspace-prod",
    sku: "PerGB2018",
    retentionInDays: 30,
  },
  applicationInsightsName: "app-insights-prod",
  actionGroups: [
    {
      name: "ag-devops-alerts",
      shortName: "devops",
      emailReceivers: [
        {
          name: "admin",
          emailAddress: "admin@example.com",
          useCommonAlertSchema: true,
        },
      ],
    },
  ],
  tags: {
    purpose: "monitoring-and-diagnostics",
    environment: "multicloud",
    managedBy: "cdktn",
  },
};
