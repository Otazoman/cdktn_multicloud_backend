import { ComputeGlobalAddress } from "@cdktn/provider-google/lib/compute-global-address";
import { ComputeNetworkPeeringRoutesConfig } from "@cdktn/provider-google/lib/compute-network-peering-routes-config";
import { DataGoogleComputeGlobalAddress } from "@cdktn/provider-google/lib/data-google-compute-global-address";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { ServiceNetworkingConnection } from "@cdktn/provider-google/lib/service-networking-connection";
import { Construct } from "constructs";

/** Configuration for a single named IP range registered in ServiceNetworkingConnection */
interface ServiceSubRange {
  /** Name of the ComputeGlobalAddress resource */
  rangeName: string;
  /** Starting IP address (e.g. "10.100.10.0") */
  address: string;
  /** Prefix length (e.g. 24 for CloudSQL, 29 for Filestore) */
  prefixLength: number;
}

export interface GooglePsaConfig {
  project: string;
  vpcId: string;
  vpcName: string;
  /**
   * If true, reference existing ComputeGlobalAddress resources via DataSource
   * instead of creating new ones.
   */
  isExisting?: boolean;
  /**
   * Per-service IP range arrays to register in ServiceNetworkingConnection.
   * All ranges across all services must be non-overlapping.
   * Each array may contain one or more entries to support multiple ranges per service.
   */
  serviceRanges: {
    /** IP ranges for Cloud SQL instances (array for multiple ranges) */
    cloudSql?: ServiceSubRange[];
    /** IP ranges for Filestore instances (array; each BASIC instance needs its own /29) */
    filestore?: ServiceSubRange[];
  };
}

export class GooglePrivateServiceAccess extends Construct {
  public readonly connection: ServiceNetworkingConnection;
  /** Peering routes config resource - expose so dependents can declare an explicit depends_on */
  public readonly peeringRoutesConfig: ComputeNetworkPeeringRoutesConfig;
  /** Names of all CloudSQL ComputeGlobalAddress resources */
  public readonly cloudSqlRangeNames: string[] = [];
  /** Names of all Filestore ComputeGlobalAddress resources */
  public readonly filestoreRangeNames: string[] = [];

  /**
   * Static factory that returns an existing instance from the scope or creates a new one.
   * Ensures only a single PSA construct is created per CDK scope (singleton pattern).
   */
  public static getOrCreate(
    scope: Construct,
    id: string,
    provider: GoogleProvider,
    config: GooglePsaConfig,
  ): GooglePrivateServiceAccess {
    const existing = scope.node.tryFindChild(id);
    if (existing instanceof GooglePrivateServiceAccess) {
      return existing;
    }
    return new GooglePrivateServiceAccess(scope, id, provider, config);
  }

  private constructor(
    scope: Construct,
    id: string,
    provider: GoogleProvider,
    config: GooglePsaConfig,
  ) {
    super(scope, id);

    // ----------------------------------------------------------------
    // 1. Build the list of reserved peering ranges.
    //    Each entry in each service array gets its own ComputeGlobalAddress.
    //    All ranges must be non-overlapping; GCP rejects overlapping ranges.
    // ----------------------------------------------------------------
    const reservedPeeringRanges: string[] = [];

    // Helper: create or reference a ComputeGlobalAddress and return its name
    const resolveRange = (
      r: ServiceSubRange,
      constructId: string,
      existingConstructId: string,
    ): string => {
      if (config.isExisting) {
        const existing = new DataGoogleComputeGlobalAddress(
          this,
          existingConstructId,
          { provider, project: config.project, name: r.rangeName },
        );
        return existing.name;
      } else {
        const addr = new ComputeGlobalAddress(this, constructId, {
          provider,
          project: config.project,
          name: r.rangeName,
          purpose: "VPC_PEERING",
          addressType: "INTERNAL",
          address: r.address,
          prefixLength: r.prefixLength,
          network: config.vpcId,
        });
        return addr.name;
      }
    };

    // CloudSQL ranges
    if (config.serviceRanges.cloudSql) {
      config.serviceRanges.cloudSql.forEach((r, i) => {
        const name = resolveRange(
          r,
          `cloudsql-psa-address-${i}`,
          `existing-cloudsql-psa-address-${i}`,
        );
        this.cloudSqlRangeNames.push(name);
        reservedPeeringRanges.push(name);
      });
    }

    // Filestore ranges
    if (config.serviceRanges.filestore) {
      config.serviceRanges.filestore.forEach((r, i) => {
        const name = resolveRange(
          r,
          `filestore-psa-address-${i}`,
          `existing-filestore-psa-address-${i}`,
        );
        this.filestoreRangeNames.push(name);
        reservedPeeringRanges.push(name);
      });
    }

    // ----------------------------------------------------------------
    // 2. Service Networking Connection (single VPC peering to Google services)
    //    All non-overlapping ranges are registered at once.
    // ----------------------------------------------------------------
    this.connection = new ServiceNetworkingConnection(
      this,
      "shared-psa-connection",
      {
        provider,
        network: config.vpcId,
        service: "servicenetworking.googleapis.com",
        reservedPeeringRanges,
      },
    );

    // ----------------------------------------------------------------
    // 3. Peering Routes Configuration
    //    Export/import custom routes so VPN/on-premise routes are
    //    propagated across the peering.
    //    Uses vpcName (not vpcId/selfLink) to avoid double-path URL errors.
    //    Exposed as a public field so that dependents (e.g. Filestore) can
    //    declare an explicit depends_on on this resource and guarantee it
    //    is fully applied before they are created.
    // ----------------------------------------------------------------
    this.peeringRoutesConfig = new ComputeNetworkPeeringRoutesConfig(
      this,
      "shared-psa-routes",
      {
        provider,
        project: config.project,
        peering: "servicenetworking-googleapis-com",
        network: config.vpcName,
        exportCustomRoutes: true,
        importCustomRoutes: true,
        dependsOn: [this.connection],
      },
    );
  }
}
