/**
 * Build stage (config/buildstage.ts): the three API container settings that
 * follow the first deployment, from state/<env>/build-stage.json.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildStage } from "../config/buildstage";

const originalStage = process.env.BUILD_STAGE;
const originalCwd = process.cwd();
let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "build-stage-"));
  process.chdir(workDir);
  delete process.env.BUILD_STAGE;
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(workDir, { recursive: true, force: true });
  process.env.BUILD_STAGE = originalStage;
});

const writeStage = (content: string) => {
  fs.mkdirSync(path.join(workDir, "state", "dev"), { recursive: true });
  fs.writeFileSync(path.join(workDir, "state", "dev", "build-stage.json"), content);
};

test("stage 1 without the file", () => {
  expect(buildStage()).toBe(1);
});

test("stage from state/<env>/build-stage.json", () => {
  writeStage('{ "stage": 3 }\n');
  expect(buildStage()).toBe(3);
});

test("BUILD_STAGE overrides the file", () => {
  writeStage('{ "stage": 3 }\n');
  process.env.BUILD_STAGE = "2";
  expect(buildStage()).toBe(2);
});

test("an invalid stage fails", () => {
  writeStage('{ "stage": 4 }\n');
  expect(() => buildStage()).toThrow(/must be 1, 2 or 3/);
});

test.each([
  [1, { azureSecretReady: false, readinessProbe: false, journalPrune: false }],
  [2, { azureSecretReady: true, readinessProbe: false, journalPrune: false }],
  [3, { azureSecretReady: true, readinessProbe: true, journalPrune: true }],
])("stage %i sets the API container settings", (stage, expected) => {
  process.env.BUILD_STAGE = String(stage);
  jest.isolateModules(() => {
    const { apiContainerConfig } = require("../config/apicontainer");
    expect({
      azureSecretReady: apiContainerConfig.azureSecretReady,
      readinessProbe: apiContainerConfig.readinessProbe,
      journalPrune: apiContainerConfig.journalPrune.enabled,
    }).toEqual(expected);
  });
});
