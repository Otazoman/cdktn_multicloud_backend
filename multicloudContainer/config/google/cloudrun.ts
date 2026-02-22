export const gcpRunConfigs = [
  {
    name: "web-service",
    build: true,
    project: "multicloud-sitevpn-project",
    location: "asia-northeast1",
    image: "gcr.io/cloudrun/hello",
    port: 8080,
    allowUnauthenticated: true,
    minInstances: 0,
    maxInstances: 5,
  },
];
