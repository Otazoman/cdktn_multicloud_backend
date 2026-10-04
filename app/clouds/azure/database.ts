import { azureDatabaseConfig } from "../../config/azure/azuresettings";
import { isFeatureEnabled } from "../../config/features";
import {
  createSharedPrivateDnsZones,
} from "../../constructs/dns/privatezone/azureprivatezone";
import { createAzureDatabases } from "../../constructs/relationaldatabase/azuredatabase";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { AzureBuildContext } from "./context";

/** 4. Azure Database (feature: dbs) */
export function createAzureDatabaseResources(ctx: AzureBuildContext): void {
  const { scope, azureProvider, output, azureVnetResources } = ctx;

  // ──────────────────────────────────────────────
  // 4. Azure Database
  // ──────────────────────────────────────────────
  if (isFeatureEnabled("azure", "dbs")) {
    if (
      typeof azureVnetResources.vnet === "object" &&
      "name" in azureVnetResources.vnet &&
      !("id" in azureVnetResources.vnet)
    ) {
      console.warn(
        "Azure VNet is not properly initialized for database creation",
      );
    } else {
      const databaseTypes = new Set<"mysql" | "postgresql">(
        azureDatabaseConfig.databases
          .filter((config) => config.build)
          .map((config) => config.type),
      );

      const sharedDnsZones = createSharedPrivateDnsZones(
        scope,
        azureProvider,
        azureDatabaseConfig.resourceGroupName,
        azureVnetResources.vnet,
        databaseTypes,
        azureDatabaseConfig.sharedDnsVnetLinkNames,
      );

      const azureDatabases = createAzureDatabases(scope, azureProvider, {
        resourceGroupName: azureDatabaseConfig.resourceGroupName,
        location: azureDatabaseConfig.location,
        databaseConfigs: azureDatabaseConfig.databases.filter(
          (config) => config.build,
        ),
        virtualNetwork: azureVnetResources.vnet,
        subnets: azureVnetResources.subnets,
        sharedDnsZones,
      });

      azureDatabases.forEach((dbOutput) => {
        addTerraformDependency(dbOutput.server, azureVnetResources);
      });

      const buildableDbConfigs = azureDatabaseConfig.databases.filter(
        (config) => config.build,
      );

      output.dbResources = azureDatabases.map((dbOutput, idx) => ({
        server: dbOutput.server,
        database: dbOutput.database,
        privateDnsZone: dbOutput.privateDnsZone,
        fqdn: dbOutput.fqdn,
        cnameRecordName: buildableDbConfigs[idx]?.cnameRecordName,
      }));
    }
  }

}
