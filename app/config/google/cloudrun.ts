import { LOCATION, PROJECT_NAME } from "./common";

/**
 * Cloud Run services.
 *
 * Scaling: minInstances / maxInstances, and optionally
 * maxInstanceRequestConcurrency (max concurrent requests per instance,
 * default 80). Cloud Run scales automatically on CPU utilization and request
 * concurrency; the CPU target cannot be configured.
 */
export const gcpRunConfigs = [
  {
    name: "web-service-with-lb",
    build: true,
    project: PROJECT_NAME,
    location: LOCATION,
    image: "gcr.io/cloudrun/hello",
    port: 8080,
    cpu: "1", // ADDED: CPU parameter
    memory: "512Mi", // ADDED: Memory parameter
    minInstances: 1, // ADDED: Min scale
    maxInstances: 2, // ADDED: Max scale
    cpuAlwaysAllocated: true,
    allowUnauthenticated: true,
    useLb: true,
    subnetworkName: "multicloud-gcp-vpc-app-subnet",
    // Logs: routed to logBucket (cloudlogging.ts); false only excludes them from _Default
    logs: true,
    logBucket: "cloudrun",
  },
  {
    name: "web-service-standalone",
    build: true,
    project: PROJECT_NAME,
    location: LOCATION,
    image: "gcr.io/cloudrun/hello",
    port: 8080,
    cpu: "0.5", // Example for smaller service
    memory: "256Mi",
    minInstances: 0,
    maxInstances: 2,
    cpuAlwaysAllocated: false,
    allowUnauthenticated: true,
    useLb: false,
    subnetworkName: "multicloud-gcp-vpc-app-subnet",
    // Logs: routed to logBucket (cloudlogging.ts); false only excludes them from _Default
    logs: true,
    logBucket: "cloudrun",
  },
];
