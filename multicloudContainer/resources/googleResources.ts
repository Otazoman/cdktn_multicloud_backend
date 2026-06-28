/**
 * googleResources.ts
 *
 * Single-cloud orchestrator for ALL Google Cloud resources.
 *
 * Resource creation order (all within one file so Construct references can be
 * passed directly, giving CDKTF the information it needs to generate proper
 * depends_on entries in cdk.tf.json):
 *
 *   1. VPC / Subnets / Firewall / NAT
 *   2. Public DNS Zone  (useDns)
 *   3. Filestore        (useStorage)
 *   4. Cloud SQL        (useDbs)
 *   5. GCE              (useVms)
 *   6. Cloud Run + LB   (useContainers)
 *   7. DNS A-records    (useDns + useContainers)
 *
 * The VPC zombie-deletion problem was caused by subnet IDs being passed as
 * plain string tokens to Cloud Run / LB resources in separate orchestrators,
 * preventing CDKTF from inferring the dependency graph.  By keeping everything
 * in one file we can pass the ComputeSubnetwork Construct directly, so Terraform
 * will always destroy Cloud Run / LB before it removes the subnets.
 */

import { DnsManagedZone } from "@cdktn/provider-google/lib/dns-managed-zone";
import { DnsRecordSet } from "@cdktn/provider-google/lib/dns-record-set";
import { GoogleProvider } from "@cdktn/provider-google/lib/provider";
import { NullProvider } from "@cdktn/provider-null/lib/provider";
import { Resource as NullResource } from "@cdktn/provider-null/lib/resource";
import { TerraformOutput } from "cdktn";
import { Construct } from "constructs";

import {
  awsToGoogle,
  googleToAzure,
  useCicd,
  useContainers,
  useDbs,
  useDns,
  useStorage,
  useVms,
} from "../config/commonsettings";
import {
  cloudSqlConfig,
  filestoreConfigs,
  gceInstancesParams,
  gcpLbConfigs,
  gcpRunConfigs,
  googleCicdConfigs,
  googlePsaConfig,
  googleVpcResourcesparams,
} from "../config/google/googlesettings";
import { createGoogleCertificate } from "../constructs/certificates/googlemanegedssl";
import { createGoogleCicdResources } from "../constructs/cicd/googlecicd";
import { createGoogleCloudRunResources } from "../constructs/container/googlecloudrun";
import { createGoogleLbResources } from "../constructs/loadbarancer/googlelb";
import {
  CloudSqlConfig,
  createGoogleCloudSqlInstance,
} from "../constructs/relationaldatabase/googlecloudsql";
import { createGoogleFilestoreInstances } from "../constructs/storage/googlefilestore";
import { createGoogleGceInstances } from "../constructs/vmresources/googlegce";
import { GooglePrivateServiceAccess } from "../constructs/vpcnetwork/googlepsa";
import { createGoogleVpcResources } from "../constructs/vpcnetwork/googlevpc";
import {
  GoogleLbResourcesWithDns,
  GoogleResourcesOutput,
  GoogleVpcResources,
  LoadBalancerDnsInfo,
} from "./interfaces";

/**
 * Creates all Google Cloud resources in the correct dependency order.
 *
 * Conditions for each sub-section are evaluated from commonsettings.ts –
 * the config itself is never changed.
 */
export const createGoogleResources = (
  scope: Construct,
  googleProvider: GoogleProvider,
): GoogleResourcesOutput => {
  const output: GoogleResourcesOutput = {};

  // ──────────────────────────────────────────────
  // 1. VPC
  // ──────────────────────────────────────────────
  if (!googleVpcResourcesparams.isEnabled) {
    return output;
  }

  const vpcRaw = createGoogleVpcResources(
    scope,
    googleProvider,
    googleVpcResourcesparams,
  );

  // Build a name-keyed map of subnets so downstream resources can look them up
  // by logical name without resorting to fragile string-token comparisons.
  const subnetsByName: Record<string, any> = {};
  googleVpcResourcesparams.subnets.forEach((cfg, idx) => {
    // The subnet Construct name is "${vpcName}-${subnet.name}"
    const fullName = `${googleVpcResourcesparams.vpcName}-${cfg.name}`;
    subnetsByName[fullName] = vpcRaw.subnets[idx];
    // Also register by short name for convenience
    subnetsByName[cfg.name] = vpcRaw.subnets[idx];
  });

  const googleVpcResources: GoogleVpcResources = {
    vpc: vpcRaw.vpc,
    subnets: vpcRaw.subnets,
    subnetsByName,
    proxySubnets: vpcRaw.proxySubnets ?? [],
    ingressrules: vpcRaw.ingressrules,
    egressrules: vpcRaw.egressrules,
    vpcLabels: googleVpcResourcesparams.vpcLabels,
  };

  output.vpc = googleVpcResources;

  // ──────────────────────────────────────────────
  // 2. Public DNS Zone
  // ──────────────────────────────────────────────
  const publicZones: Record<string, DnsManagedZone> = {};

  if (useDns && gcpLbConfigs) {
    const unique = (arr: (string | undefined)[]) =>
      Array.from(new Set(arr.filter(Boolean))) as string[];

    const googleSubdomains = unique(
      gcpLbConfigs.filter((c) => c.build).map((c) => c.dnsConfig?.subdomain),
    );

    googleSubdomains.forEach((subdomain) => {
      const zoneSafeName = subdomain.replace(/\./g, "-");
      const zone = new DnsManagedZone(scope, `p-zone-gcp-${zoneSafeName}`, {
        provider: googleProvider,
        project: gcpLbConfigs[0].project,
        name: `zone-${zoneSafeName}`,
        dnsName: subdomain.endsWith(".") ? subdomain : `${subdomain}.`,
        visibility: "public",
      });
      publicZones[subdomain] = zone;
      new TerraformOutput(scope, `gcp-ns-${zoneSafeName}`, {
        value: zone.nameServers,
      });
    });

    output.publicZones = publicZones;
  }

  // ──────────────────────────────────────────────
  // 3. Filestore  (PSA shared with CloudSQL)
  // ──────────────────────────────────────────────
  const filestoreInstances: GoogleResourcesOutput["filestoreInstances"] = [];
  let psaDependencies: any[] | undefined;

  if (useStorage && (awsToGoogle || googleToAzure)) {
    const psa = GooglePrivateServiceAccess.getOrCreate(
      scope,
      googlePsaConfig.psaConstructId,
      googleProvider,
      {
        project: filestoreConfigs.project,
        vpcId: googleVpcResources.vpc.id,
        vpcName: googleVpcResources.vpc.name,
        isExisting: googlePsaConfig.isExisting,
        serviceRanges: googlePsaConfig.serviceRanges,
      },
    );

    psaDependencies = [psa.connection, psa.peeringRoutesConfig];

    const buildableInstances = filestoreConfigs.instances.filter(
      (c) => c.build,
    );

    const filestoreRes = createGoogleFilestoreInstances(
      scope,
      googleProvider,
      {
        project: filestoreConfigs.project,
        filestoreConfigs: buildableInstances,
        psaDependencies: [psa.connection, psa.peeringRoutesConfig],
      },
      googleVpcResources.vpc,
      googleVpcResources.subnets,
    );

    filestoreRes.forEach((res) => {
      res.instance.node.addDependency(googleVpcResources.vpc);
    });

    const filestoreMeta = filestoreRes
      .map((res, idx) => {
        const cfg = buildableInstances[idx];
        if (!cfg.aRecordName) return null;
        return {
          aRecordName: cfg.aRecordName,
          privateIpAddress: res.instance.networks.get(0).ipAddresses[0],
        };
      })
      .filter(
        (item): item is { aRecordName: string; privateIpAddress: string } =>
          item !== null,
      );

    filestoreInstances.push(...filestoreMeta);
    output.filestoreInstances = filestoreMeta;
    output.psaDependencies = psaDependencies;
  }

  // ──────────────────────────────────────────────
  // 4. Cloud SQL  (PSA shared with Filestore)
  // ──────────────────────────────────────────────
  const cloudSqlInstances: GoogleResourcesOutput["cloudSqlInstances"] = [];

  if (useDbs && (awsToGoogle || googleToAzure)) {
    const psa = GooglePrivateServiceAccess.getOrCreate(
      scope,
      googlePsaConfig.psaConstructId,
      googleProvider,
      {
        project: cloudSqlConfig.project,
        vpcId: googleVpcResources.vpc.id,
        vpcName: googleVpcResources.vpc.name,
        isExisting: googlePsaConfig.isExisting,
        serviceRanges: googlePsaConfig.serviceRanges,
      },
    );

    // Expose PSA deps if not already set by Filestore block above
    if (!psaDependencies) {
      psaDependencies = [psa.connection, psa.peeringRoutesConfig];
      output.psaDependencies = psaDependencies;
    }

    const buildableInstances = cloudSqlConfig.instances.filter((c) => c.build);

    buildableInstances.forEach((instanceConfig) => {
      const config: CloudSqlConfig = {
        ...instanceConfig,
        project: cloudSqlConfig.project,
      };

      const sqlRes = createGoogleCloudSqlInstance(
        scope,
        googleProvider,
        config,
        googleVpcResources.vpc,
        [psa.connection, psa.peeringRoutesConfig],
        instanceConfig.name,
      );

      cloudSqlInstances.push({
        name: sqlRes.sqlInstance.name,
        privateIpAddress: sqlRes.sqlInstance.privateIpAddress,
        connectionName: sqlRes.connectionName,
        aRecordName: instanceConfig.aRecordName,
      });
    });

    output.cloudSqlInstances = cloudSqlInstances;
  }

  // ──────────────────────────────────────────────
  // 5. GCE
  // ──────────────────────────────────────────────
  if (useVms && (awsToGoogle || googleToAzure)) {
    const googleGceInstances = createGoogleGceInstances(
      scope,
      googleProvider,
      {
        ...gceInstancesParams,
        // GCE must wait for PSA peering routes to be fully applied before VM
        // placement so that the VPC routing table is stable.
        psaDependencies,
      },
      googleVpcResources.vpc,
      googleVpcResources.subnets,
    );

    googleGceInstances.forEach((instance) => {
      instance.node.addDependency(googleVpcResources.vpc);
    });
  }

  // ──────────────────────────────────────────────
  // 6. Cloud Run + Load Balancer
  //
  //    Key fix (depends_on):
  //      Subnet Construct references are passed directly so CDKTF generates
  //      proper depends_on entries → Terraform destroys Cloud Run / LB before
  //      removing subnets.
  //
  //    Key fix (async GCP release lag):
  //      GCP's delete API returns success immediately but the actual resource
  //      release is asynchronous.  Two categories of lag exist:
  //
  //      ① proxy-subnet × forwardingRule
  //         The Regional LB forwarding rule is deleted first (depends_on is
  //         correct), but GCP has not yet released the proxy-subnet association
  //         when Terraform immediately tries to delete the subnet.
  //
  //      ② app-subnet × serverless-ipv4-xxxx
  //         Cloud Run Direct VPC egress causes GCP to auto-create an internal
  //         VIP address ("serverless-ipv4-xxxx") that is NOT tracked in
  //         Terraform state.  After the Cloud Run service is deleted, GCP takes
  //         up to several minutes to GC this address; deleting the subnet before
  //         GC completes raises resourceInUseByAnotherResource.
  //
  //      Solution: insert null_resource destroy provisioners between each
  //      affected subnet and the resource that uses it.  The sleep runs only
  //      during `terraform destroy`, costing nothing at apply time.
  // ──────────────────────────────────────────────
  const globalLbs: any[] = [];
  const regionalLbs: any[] = [];

  if (useContainers && (awsToGoogle || googleToAzure) && gcpLbConfigs) {
    // ── Shared NullProvider for destroy-wait resources ──────────────────
    // @cdktn/provider-null is already listed in package.json, so no extra
    // `cdktn get` is needed.  We use a dedicated alias so it does not clash
    // with any NullProvider created elsewhere (e.g. awsvpc.ts).
    const nullProvider = new NullProvider(scope, "null-gcp-wait", {
      alias: "null-gcp-wait",
    });

    // ── Wait ①: proxy-subnet release after Regional LB forwarding rule ──
    // Created once for all proxy subnets.  The LB forwarding rule will depend
    // on this wait resource, so destroy order becomes:
    //   forwardingRule → nullWaitProxy (sleep 240s) → proxySubnet
    const proxySubnetWaits: Map<string, NullResource> = new Map();
    if (googleVpcResources.proxySubnets) {
      googleVpcResources.proxySubnets.forEach((ps: any, idx: number) => {
        const waitId = `wait-destroy-proxy-subnet-${idx}`;
        const waitRes = new NullResource(scope, waitId, {
          provider: nullProvider,
          // Trigger on the subnet ID so the wait is re-created if the subnet
          // changes (keeps the wait relevant after subnet replacement).
          triggers: { subnetId: ps.id },
        });
        // The provisioner runs only on destroy.
        waitRes.addOverride("provisioner", [
          {
            "local-exec": {
              when: "destroy",
              command: "sleep 240",
            },
          },
        ]);
        // Wait depends on the subnet → subnet is destroyed AFTER the wait.
        waitRes.node.addDependency(ps);
        proxySubnetWaits.set(String(idx), waitRes);
      });
    }

    // ── Wait ②: app-subnet release after Cloud Run serverless-ipv4 GC ──
    // One wait per unique subnet used by a Cloud Run service with vpcAccess.
    // Destroy order: cloudRunService → nullWaitAppSubnet (sleep 240s) → subnet
    const subnetWaits: Map<string, NullResource> = new Map();

    // 6a. Cloud Run services
    const cloudRunServices: Record<string, any> = {};

    if (gcpRunConfigs) {
      gcpRunConfigs
        .filter((c) => c.build)
        .forEach((config, svcIdx) => {
          // Resolve subnet Construct by name (full or short).
          const subnetConstruct = config.subnetworkName
            ? subnetsByName[config.subnetworkName] ??
              subnetsByName[
                config.subnetworkName.replace(
                  `${googleVpcResourcesparams.vpcName}-`,
                  "",
                )
              ]
            : undefined;

          const res = createGoogleCloudRunResources(scope, googleProvider, {
            ...config,
            container: {
              image: config.image,
              port: config.port,
              cpu: config.cpu,
              memory: config.memory,
            },
            vpcSubnetId: subnetConstruct?.id,
            networkId: googleVpcResources.vpc.id,
          });

          // depends_on: Cloud Run → Subnet (structural dependency)
          if (subnetConstruct) {
            res.service.node.addDependency(subnetConstruct);
          }
          res.service.node.addDependency(googleVpcResources.vpc);

          // depends_on: Cloud Run → subnetWait → Subnet (async GC delay)
          if (subnetConstruct && config.subnetworkName) {
            const waitKey = config.subnetworkName;
            if (!subnetWaits.has(waitKey)) {
              const waitId = `wait-destroy-subnet-${svcIdx}`;
              const waitRes = new NullResource(scope, waitId, {
                provider: nullProvider,
                triggers: { subnetId: subnetConstruct.id },
              });
              waitRes.addOverride("provisioner", [
                {
                  "local-exec": {
                    when: "destroy",
                    command: "sleep 240",
                  },
                },
              ]);
              // Wait depends on subnet → subnet is destroyed AFTER the wait
              waitRes.node.addDependency(subnetConstruct);
              subnetWaits.set(waitKey, waitRes);
            }
            // Cloud Run depends on the wait resource
            res.service.node.addDependency(subnetWaits.get(waitKey)!);
          }

          cloudRunServices[config.name] = res.service;
        });
    }

    // 6b. Load Balancers
    gcpLbConfigs
      .filter((config) => config.build)
      .forEach((config) => {
        let sslCertificateNames: string[] = [];

        if (
          config.managedSsl &&
          config.managedSsl.domains &&
          config.managedSsl.domains.length > 0
        ) {
          const certRes = createGoogleCertificate(scope, googleProvider, {
            name: `${config.name}-cert`,
            domains: config.managedSsl.domains,
            project: config.project,
            type: config.loadBalancerType as "GLOBAL" | "REGIONAL",
            region: config.region,
            privateKeyPath: (config.managedSsl as any).privateKeyPath,
            certificatePath: (config.managedSsl as any).certificatePath,
          });
          sslCertificateNames.push(certRes.certificateName);
        }

        // Resolve proxy subnet Construct (Regional LB only)
        let targetProxySubnet: any = undefined;
        let proxySubnetWaitRes: NullResource | undefined = undefined;
        if (
          config.loadBalancerType === "REGIONAL" &&
          config.region &&
          googleVpcResources.proxySubnets
        ) {
          const psIdx = googleVpcResources.proxySubnets.findIndex(
            (ps: any) => ps.region === config.region,
          );
          if (psIdx >= 0) {
            targetProxySubnet = googleVpcResources.proxySubnets[psIdx];
            proxySubnetWaitRes = proxySubnetWaits.get(String(psIdx));
          }
        }

        const lb = createGoogleLbResources(
          scope,
          googleProvider,
          {
            ...config,
            protocol: config.protocol as "HTTP" | "HTTPS",
            loadBalancerType: config.loadBalancerType as "GLOBAL" | "REGIONAL",
            sslCertificateNames,
            cloudRunResources: cloudRunServices,
          },
          googleVpcResources.vpc,
          targetProxySubnet,
        );

        // LB must be destroyed before VPC
        lb.forwardingRule.node.addDependency(googleVpcResources.vpc);

        // LB must be destroyed before proxy subnet (Regional)
        if (config.loadBalancerType === "REGIONAL" && targetProxySubnet) {
          lb.forwardingRule.node.addDependency(targetProxySubnet);
          Object.values(lb.backendServices).forEach((be: any) => {
            be.node.addDependency(targetProxySubnet);
          });
          // Also depend on the proxy-subnet wait so that:
          //   forwardingRule → proxySubnetWait (sleep 240s) → proxySubnet
          if (proxySubnetWaitRes) {
            lb.forwardingRule.node.addDependency(proxySubnetWaitRes);
          }
        }

        // Attach DNS metadata
        if (config.dnsConfig) {
          const dnsInfo: LoadBalancerDnsInfo = {
            subdomain: config.dnsConfig.subdomain,
            fqdn: config.dnsConfig.fqdn,
          };
          (lb as any).dnsInfo = dnsInfo;
        }

        if (config.loadBalancerType === "REGIONAL") {
          regionalLbs.push(lb);
        } else {
          globalLbs.push(lb);
        }
      });

    const googleLbs: GoogleLbResourcesWithDns[] = [
      { global: globalLbs, regional: regionalLbs },
    ];
    output.lbs = googleLbs;

    // ──────────────────────────────────────────────
    // 7. DNS A-records
    //    Registered here so the LB forwardingRule IP is available as a
    //    Construct reference (no separate "Phase 2" DNS step needed).
    // ──────────────────────────────────────────────
    if (useDns) {
      [...globalLbs, ...regionalLbs].forEach((lb, index) => {
        if (!lb.dnsInfo) return;
        const zone = publicZones[lb.dnsInfo.subdomain];
        const ipAddress = lb.staticIp?.address || lb.forwardingRule.ipAddress;
        if (zone && ipAddress) {
          new DnsRecordSet(scope, `gcp-a-rec-${index}`, {
            provider: googleProvider,
            project: zone.project,
            managedZone: zone.name,
            name: lb.dnsInfo.fqdn
              ? lb.dnsInfo.fqdn.endsWith(".")
                ? lb.dnsInfo.fqdn
                : `${lb.dnsInfo.fqdn}.`
              : zone.dnsName,
            type: "A",
            ttl: 300,
            rrdatas: [ipAddress],
          });
        }
      });
    }
  }
  // ──────────────────────────────────────────────
  // 8. Artifact Registry + Cloud Build (VPC-compatible)
  // ──────────────────────────────────────────────
  if (useCicd && googleCicdConfigs) {
    googleCicdConfigs
      .filter((c) => c.build)
      .forEach((config) => {
        const psa = GooglePrivateServiceAccess.getOrCreate(
          scope,
          googlePsaConfig.psaConstructId,
          googleProvider,
          {
            project: cloudSqlConfig.project,
            vpcId: googleVpcResources.vpc.id,
            vpcName: googleVpcResources.vpc.name,
            isExisting: googlePsaConfig.isExisting,
            serviceRanges: googlePsaConfig.serviceRanges,
          },
        );

        if (!psaDependencies) {
          psaDependencies = [psa.connection, psa.peeringRoutesConfig];
          output.psaDependencies = psaDependencies;
        }

        const cicdRes = createGoogleCicdResources(
          scope,
          googleProvider,
          {
            ...config,
            project: cloudSqlConfig.project,
          },
          googleVpcResources.vpc.id,
          [psa.connection, psa.peeringRoutesConfig],
        );

        // Trigger
        if (cicdRes.cloudbuildTrigger) {
          cicdRes.cloudbuildTrigger.node.addDependency(googleVpcResources.vpc);
        }

        // Private Pool
        cicdRes.cloudbuildPrivatePool.node.addDependency(
          googleVpcResources.vpc,
        );
      });
  }

  return output;
};
