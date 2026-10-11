// Jest setup (jest.config.js): tests synthesize the dev environment unless
// DEPLOY_ENV is set (FEAT-04).
process.env.DEPLOY_ENV = process.env.DEPLOY_ENV || "dev";
