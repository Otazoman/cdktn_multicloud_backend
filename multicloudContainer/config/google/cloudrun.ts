import { LOCATION, PROJECT_NAME } from "./common";

export const gcpRunConfigs = [
  {
    name: "web-service",
    build: true,
    project: PROJECT_NAME,
    location: LOCATION,
    image: "gcr.io/cloudrun/hello",
    port: 8080,
    allowUnauthenticated: true,
    minInstances: 0,
    maxInstances: 5,
  },
];
