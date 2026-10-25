import { CloudRunV2Job } from "@cdktn/provider-google/lib/cloud-run-v2-job";
import { CloudRunV2JobIamMember } from "@cdktn/provider-google/lib/cloud-run-v2-job-iam-member";
import { CloudSchedulerJob } from "@cdktn/provider-google/lib/cloud-scheduler-job";
import { DataGoogleCloudRunV2Service } from "@cdktn/provider-google/lib/data-google-cloud-run-v2-service";
import { DataGoogleProject } from "@cdktn/provider-google/lib/data-google-project";
import { ServiceAccount } from "@cdktn/provider-google/lib/service-account";
import { DnsRecordSet } from "@cdktn/provider-google/lib/dns-record-set";
import { SecretManagerSecretIamMember } from "@cdktn/provider-google/lib/secret-manager-secret-iam-member";
import { apiContainerConfig } from "../../config/apicontainer";
import {
  API_LIVENESS_PATH,
  API_READINESS_PATH,
  apiContainerSettings,
  apiLocalDbHost,
  JOURNAL_PRUNE_COMMAND,
  journalPruneEnvironment,
} from "../apicontainer";
import { resourceName, idPart } from "../../utils/naming";
import { Resource as NullResource } from "@cdktn/provider-null/lib/resource";

import { isFeatureEnabled } from "../../config/features";
import {
  gcpLbConfigs,
  gcpRunConfigs,
  googleVpcResourcesparams,
} from "../../config/google/googlesettings";
import { createGoogleCertificate } from "../../constructs/certificates/googlemanagedssl";
import { createGoogleCloudRunResources } from "../../constructs/container/googlecloudrun";
import { createGoogleLbResources } from "../../constructs/loadbalancer/googlelb";
import { LoadBalancerDnsInfo } from "../common";
import { GoogleLbResourcesWithDns } from "./types";
import { googleCicdDeployTargets } from "./cicd";
import { addTerraformDependency } from "../../utils/terraformDependency";
import { GoogleBuildContext } from "./context";
import { ComputeSubnetwork } from "@cdktn/provider-google/lib/compute-subnetwork";
import { GoogleGlobalLbResources, GoogleRegionalLbResources } from "./types";

/** 6-7. Cloud Run, load balancers and DNS A-records (feature: containers) */
export function createGoogleContainers(ctx: GoogleBuildContext): void {
  const { scope, providers, googleProvider, output, subnetsByName, googleVpcResources, publicZones } = ctx;

  // ──────────────────────────────────────────────
  // 6. Cloud Run + Load Balancer
  //
  //    Destroy order (depends_on via addTerraformDependency):
  //      Terraform destroys Cloud Run / LB before removing subnets.
  //
  //    Async GCP release lag:
  //      GCP's delete API returns success immediately but the actual resource
  //      release is asynchronous.  Two categories of lag exist:
  //
  //      ① proxy-subnet × forwardingRule
  //         The Regional LB forwarding rule is not attribute-linked to the
  //         proxy-only subnet, so an explicit dependency plus a short destroy
  //         wait is inserted: forwardingRule → wait (sleep 240s) → proxySubnet.
  //
  //      ② app-subnet × serverless-ipv4-xxxx
  //         Cloud Run Direct VPC egress makes GCP reserve internal addresses
  //         ("serverless-ipv4-xxxx") that are NOT tracked in Terraform state.
  //         GCP releases them 1-2 hours after the Cloud Run service is deleted
  //         (documented behaviour), so no reasonable wait can cover it.
  //         The subnet (and the VPC) fail to delete on the first destroy; run
  //         destroy again after 1-2 hours. See README "Cloud Run Note".
  // ──────────────────────────────────────────────
  const globalLbs: GoogleGlobalLbResources[] = [];
  const regionalLbs: GoogleRegionalLbResources[] = [];

  if (isFeatureEnabled("google", "containers") && gcpLbConfigs) {
    // ── Shared null provider for destroy-wait resources ─────────────────
    const nullProvider = providers.null();

    // ── Wait ①: proxy-subnet release after Regional LB forwarding rule ──
    // Created once for all proxy subnets.  The LB forwarding rule will depend
    // on this wait resource, so destroy order becomes:
    //   forwardingRule → nullWaitProxy (sleep 240s) → proxySubnet
    const proxySubnetWaits: Map<string, NullResource> = new Map();
    if (googleVpcResources.proxySubnets) {
      googleVpcResources.proxySubnets.forEach((ps, idx) => {
        const waitId = `wait-destroy-proxy-subnet-${ps.node.id}`;
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
        addTerraformDependency(waitRes, ps);
        proxySubnetWaits.set(String(idx), waitRes);
      });
    }

    // 6a. Cloud Run services
    const cloudRunServices = ctx.cloudRunServices;
    // Services deployed by CI/CD: Terraform ignores their image
    const cicdTargets = googleCicdDeployTargets();

    if (gcpRunConfigs) {
      gcpRunConfigs
        .filter((c) => c.build)
        .forEach((config) => {
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

          // The API (config/apicontainer.ts): the service CI/CD deploys to,
          // when Google Cloud has a database. It runs as the default compute
          // service account (CI/CD acts as it: constructs/cicd/googlecicd.ts),
          // which may read only the password secret.
          const api = cicdTargets.has(config.name)
            ? apiContainerSettings(scope, "google", () =>
                apiLocalDbHost(
                  "google",
                  (output.cloudSqlInstances ?? [])
                    .filter((i) => i.databaseVersion.startsWith("POSTGRES"))
                    .map((i) => ({ name: i.aRecordName, host: i.privateIpAddress })),
                ),
              )
            : undefined;
          let apiSecretAccess: SecretManagerSecretIamMember | undefined;
          let secretEnvironment: { name: string; secret: string }[] | undefined;
          if (api) {
            const secret = ctx.dbSecrets?.get(apiContainerConfig.passwordSecretKey);
            if (!secret) {
              throw new Error(
                `Cloud Run service "${config.name}" (API): secret "${apiContainerConfig.passwordSecretKey}" ` +
                  `not found in config/google/secrets.ts`,
              );
            }
            const project = new DataGoogleProject(
              scope,
              `run-api-project-${idPart(config.name)}`,
              { provider: googleProvider, projectId: config.project },
            );
            apiSecretAccess = new SecretManagerSecretIamMember(
              scope,
              `run-api-secret-access-${idPart(config.name)}`,
              {
                provider: googleProvider,
                secretId: secret.id,
                role: "roles/secretmanager.secretAccessor",
                member: `serviceAccount:${project.number}-compute@developer.gserviceaccount.com`,
              },
            );
            secretEnvironment = api.passwordVariables.map((name) => ({
              name,
              secret: secret.secretId,
            }));
          }
          const probes = api && apiContainerConfig.readinessProbe;

          const res = createGoogleCloudRunResources(scope, googleProvider, {
            ...config,
            container: {
              image: config.image,
              port: config.port,
              cpu: config.cpu,
              memory: config.memory,
              environment: api?.environment,
              secretEnvironment,
              startupProbePath: probes ? API_READINESS_PATH : undefined,
              livenessProbePath: probes ? API_LIVENESS_PATH : undefined,
            },
            vpcSubnetId: subnetConstruct?.id,
            networkId: googleVpcResources.vpc.id,
            ignoreImageChanges: cicdTargets.has(config.name),
          });

          // depends_on: Cloud Run → Subnet (structural dependency)
          if (subnetConstruct) {
            addTerraformDependency(res.service, subnetConstruct);
          }
          addTerraformDependency(res.service, googleVpcResources.vpc);
          // Cloud Run checks the access to the secrets when it creates a revision
          if (apiSecretAccess) {
            addTerraformDependency(res.service, apiSecretAccess);
          }

          cloudRunServices[config.name] = res.service;

          // Journal pruning job (config/apicontainer.ts journalPrune): the
          // API's image (read from the deployed service; CI/CD updates the
          // job afterwards), settings and network, started by Cloud Scheduler.
          if (api && apiContainerConfig.journalPrune.enabled) {
            const prune = apiContainerConfig.journalPrune;
            const jobName = resourceName(prune.names.google, "google", "journal-prune");
            const deployed = new DataGoogleCloudRunV2Service(
              scope,
              `journal-prune-api-image-${idPart(config.name)}`,
              {
                provider: googleProvider,
                name: config.name,
                location: config.location,
                project: config.project,
                dependsOn: [res.service],
              },
            );
            const job = new CloudRunV2Job(scope, `journal-prune-${idPart(config.name)}`, {
              provider: googleProvider,
              name: jobName,
              location: config.location,
              project: config.project,
              deletionProtection: false,
              template: {
                template: {
                  maxRetries: 1,
                  timeout: "1800s",
                  vpcAccess: subnetConstruct
                    ? {
                        egress: "ALL_TRAFFIC",
                        networkInterfaces: [
                          {
                            network: googleVpcResources.vpc.id,
                            subnetwork: subnetConstruct.id,
                          },
                        ],
                      }
                    : undefined,
                  containers: [
                    {
                      image: deployed.template.get(0).containers.get(0).image,
                      command: JOURNAL_PRUNE_COMMAND,
                      env: [
                        ...[...(api.environment ?? []), ...journalPruneEnvironment()].map(
                          (e) => ({ name: e.name, value: e.value }),
                        ),
                        ...(secretEnvironment ?? []).map((e) => ({
                          name: e.name,
                          valueSource: { secretKeyRef: { secret: e.secret, version: "latest" } },
                        })),
                      ],
                      resources: { limits: { cpu: "1", memory: "512Mi" } },
                    },
                  ],
                },
              },
            });
            job.addOverride("lifecycle", {
              ignore_changes: ["template[0].template[0].containers[0].image", "client", "client_version"],
            });
            if (apiSecretAccess) {
              addTerraformDependency(job, apiSecretAccess);
            }

            const invoker = new ServiceAccount(scope, `journal-prune-scheduler-sa-${idPart(config.name)}`, {
              provider: googleProvider,
              project: config.project,
              accountId: "journal-prune-scheduler",
              displayName: "Starts the journal pruning job",
            });
            const invokerRole = new CloudRunV2JobIamMember(
              scope,
              `journal-prune-scheduler-invoker-${idPart(config.name)}`,
              {
                provider: googleProvider,
                project: config.project,
                location: config.location,
                name: job.name,
                role: "roles/run.invoker",
                member: `serviceAccount:${invoker.email}`,
              },
            );
            const scheduler = new CloudSchedulerJob(
              scope,
              `journal-prune-scheduler-${idPart(config.name)}`,
              {
                provider: googleProvider,
                project: config.project,
                region: config.location,
                name: jobName,
                schedule: prune.schedules.google,
                timeZone: prune.timeZone,
                httpTarget: {
                  httpMethod: "POST",
                  uri: `https://run.googleapis.com/v2/projects/${config.project}/locations/${config.location}/jobs/${job.name}:run`,
                  oauthToken: { serviceAccountEmail: invoker.email },
                },
              },
            );
            addTerraformDependency(scheduler, invokerRole);
            ctx.journalPruneJobs[config.name] = job;
          }
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
            // The construct ID keeps its original form (Terraform address)
            id: `${config.name}-cert`,
            name: resourceName(
              config.managedSsl.certificateName,
              "google",
              "ssl-certificate",
              config.name,
            ),
            domains: config.managedSsl.domains,
            project: config.project,
            type: config.loadBalancerType as "GLOBAL" | "REGIONAL",
            region: config.region,
            privateKeyPath: config.managedSsl.privateKeyPath,
            certificatePath: config.managedSsl.certificatePath,
          });
          sslCertificateNames.push(certRes.certificateName);
        }

        // Resolve proxy subnet Construct (Regional LB only)
        let targetProxySubnet: ComputeSubnetwork | undefined = undefined;
        let proxySubnetWaitRes: NullResource | undefined = undefined;
        if (
          config.loadBalancerType === "REGIONAL" &&
          config.region &&
          googleVpcResources.proxySubnets
        ) {
          // Match by the region in config: the subnet Construct's `region`
          // getter returns an unresolved token, never the literal string.
          // proxySubnets are created in the same order as the config entries.
          const psIdx = (googleVpcResourcesparams.proxySubnets ?? []).findIndex(
            (ps) => ps.region === config.region,
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
        addTerraformDependency(lb.forwardingRule, googleVpcResources.vpc);

        // LB must be destroyed before proxy subnet (Regional)
        if (config.loadBalancerType === "REGIONAL" && targetProxySubnet) {
          addTerraformDependency(lb.forwardingRule, targetProxySubnet);
          Object.values(lb.backendServices).forEach((be) => {
            addTerraformDependency(be, targetProxySubnet);
          });
          // Also depend on the proxy-subnet wait so that:
          //   forwardingRule → proxySubnetWait (sleep 240s) → proxySubnet
          if (proxySubnetWaitRes) {
            addTerraformDependency(lb.forwardingRule, proxySubnetWaitRes);
          }
        }

        // Attach DNS metadata
        if (config.dnsConfig) {
          const dnsInfo: LoadBalancerDnsInfo = {
            subdomain: config.dnsConfig.subdomain,
            fqdn: config.dnsConfig.fqdn,
          };
          Object.assign(lb, { dnsInfo });
        }

        if (config.loadBalancerType === "REGIONAL") {
          regionalLbs.push(lb as GoogleRegionalLbResources);
        } else {
          globalLbs.push(lb as GoogleGlobalLbResources);
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
    if (isFeatureEnabled("google", "dns")) {
      [...globalLbs, ...regionalLbs].forEach((lb) => {
        if (!lb.dnsInfo) return;
        const zone = publicZones[lb.dnsInfo.subdomain];
        const ipAddress = lb.staticIp?.address || lb.forwardingRule.ipAddress;
        if (zone && ipAddress) {
          new DnsRecordSet(scope, `gcp-a-rec-${idPart(lb.dnsInfo.fqdn || lb.dnsInfo.subdomain)}`, {
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
}
