import { LOCATION, PROJECT_NAME } from "./common";

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
  },
];
