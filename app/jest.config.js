module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Tests synthesize the dev environment unless DEPLOY_ENV is set (FEAT-04)
  setupFiles: ["<rootDir>/setup.js"],
};
