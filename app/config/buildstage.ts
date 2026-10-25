// ---------------------------------------------------------------------------
// Build stage of the environment (docs/operations.md, "Build an environment")
//
// The first deployment runs `cdktn deploy` three times; two settings can be
// turned on only after work outside cdktn. The stage is kept per environment
// in state/<env>/build-stage.json (with the Terraform state, not in Git) and
// set with `npm run build-stage -- <stage>`:
//   1  first deploy           everything off
//   2  after the secrets      Azure Container App references the Key Vault secret
//   3  after CI/CD deployed   readiness checks on /readyz, journal pruning jobs
// `npm run before-destroy` sets it back to 1. Without the file: 1.
// BUILD_STAGE in the environment overrides the file (the tests use 1).
//
// The file also keeps the Azure database's private IP for a cluster without
// the private DNS (npm run build-stage -- 2 --azure-db-ip <ip>): read at
// every synthesis, unlike .env.<env>, which the container reads at start.
// ---------------------------------------------------------------------------

import * as fs from "fs";
import * as path from "path";
import { currentEnv } from "./environment";

export type BuildStage = 1 | 2 | 3;

/** state/<env>/build-stage.json (next to the Terraform state) */
export const buildStageFile = (): string =>
  path.join(process.cwd(), "state", currentEnv(), "build-stage.json");

const readFile = (): { stage?: unknown; azureDbPrivateIp?: unknown } | undefined => {
  const file = buildStageFile();
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : undefined;
};

const parseStage = (value: unknown, source: string): BuildStage => {
  const stage = Number(value);
  if (stage !== 1 && stage !== 2 && stage !== 3) {
    throw new Error(`Build stage must be 1, 2 or 3 (${source}: ${JSON.stringify(value)})`);
  }
  return stage;
};

/** The build stage of the current environment (DEPLOY_ENV) */
export function buildStage(): BuildStage {
  if (process.env.BUILD_STAGE) {
    return parseStage(process.env.BUILD_STAGE, "BUILD_STAGE");
  }
  const content = readFile();
  return content ? parseStage(content.stage, buildStageFile()) : 1;
}

/** The Azure database's private IP recorded with the stage, if any */
export function recordedAzureDbPrivateIp(): string | undefined {
  const value = readFile()?.azureDbPrivateIp;
  return typeof value === "string" && value !== "" ? value : undefined;
}
