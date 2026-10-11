// ---------------------------------------------------------------------------
// CI/CD shared by every cloud (FEAT-01 #4)
//
// Each cloud builds the same application repository with its own build
// system (AWS CodeBuild, Google Cloud Build). The build definitions live in
// the application repository (buildspec.yml, cloudbuild.yaml); cdktn creates
// the triggers and passes the names of the infrastructure to them.
// ---------------------------------------------------------------------------

import { byEnv } from "./environment";

/** GitHub repository of the application. */
export const appRepository = {
  owner: "Otazoman",
  name: "multipleclouds-api-app",
};

/** HTTPS clone URL of appRepository. */
export const appRepositoryUrl = `https://github.com/${appRepository.owner}/${appRepository.name}.git`;

export interface CicdTrigger {
  /**
   * Branches whose pushes (merged pull requests) start the build. Exact
   * branch names, not patterns.
   */
  branches: string[];
}

/** Build trigger of the current environment (DEPLOY_ENV). */
export const cicdTrigger: CicdTrigger = byEnv<CicdTrigger>({
  default: { branches: ["main"] },
});
