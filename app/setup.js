// Jest setup (jest.config.js): tests synthesize the dev environment unless
// DEPLOY_ENV is set (FEAT-04).
process.env.DEPLOY_ENV = process.env.DEPLOY_ENV || "dev";
// ...at build stage 1 (config/buildstage.ts), whatever state/<env>/build-stage.json says
process.env.BUILD_STAGE = process.env.BUILD_STAGE || "1";
