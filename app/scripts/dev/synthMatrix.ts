/**
 * Synthesis matrix helpers shared by the regression test
 * (__tests__/synth-matrix.test.ts) and the before/after comparison script
 * (scripts/dev/synth-matrix.ts).
 *
 * The full stack is synthesized for every combination of `env` and the VPN
 * connection flags, for several feature sets, by overriding the exports of
 * config/commonsettings.ts in memory (the file itself is never modified).
 *
 * NOTE: synthesized output contains secrets loaded from config/.env
 * (e.g. DB passwords). Never commit it.
 */
import * as path from "path";
import { Testing } from "cdktn";

const APP_DIR = path.resolve(__dirname, "../..");

const allFeaturesOn = {
  enabled: true,
  features: {
    vms: true,
    dbs: true,
    storage: true,
    containers: true,
    cicd: true,
    dns: true,
    alerting: true,
    logArchive: false,
  },
};

/** Setting overrides combined with every env x connection pattern. */
export const FEATURE_SETS: Record<string, Record<string, unknown>> = {
  // Values currently written in config/commonsettings.ts
  current: {},
  // Every cloud and feature enabled (covers code paths disabled in the
  // current config)
  allOn: {
    useVpn: true,
    hostZones: true,
    clouds: { aws: allFeaturesOn, google: allFeaturesOn, azure: allFeaturesOn },
  },
};

export interface MatrixCase {
  name: string;
  overrides: Record<string, unknown>;
}

export function buildMatrixCases(
  featureSets: Record<string, Record<string, unknown>> = FEATURE_SETS,
): MatrixCase[] {
  const cases: MatrixCase[] = [];
  for (const [featureSetName, features] of Object.entries(featureSets)) {
    for (const env of ["dev", "prod"]) {
      for (const awsToGoogle of [true, false]) {
        for (const awsToAzure of [true, false]) {
          for (const googleToAzure of [true, false]) {
            cases.push({
              name:
                `${featureSetName} env=${env} awsToGoogle=${awsToGoogle} ` +
                `awsToAzure=${awsToAzure} googleToAzure=${googleToAzure}`,
              overrides: {
                ...features,
                env,
                awsToGoogle,
                awsToAzure,
                googleToAzure,
              },
            });
          }
        }
      }
    }
  }
  return cases;
}

let envLoaded = false;

/** Synthesizes the full stack for one case and returns the parsed JSON. */
export function synthCase(matrixCase: MatrixCase): any {
  if (!envLoaded) {
    require("dotenv").config({
      path: path.join(APP_DIR, "config/.env"),
      quiet: true,
    });
    envLoaded = true;
  }

  const settings = require(path.join(APP_DIR, "config/commonsettings"));
  const { MultiCloudBackendStack } = require(
    path.join(APP_DIR, "stacks/MultiCloudBackendStack"),
  );

  const original = { ...settings };
  const { log, warn } = console;
  Object.assign(settings, matrixCase.overrides);
  // Constructs print progress / warnings while synthesizing; keep output quiet.
  console.log = () => {};
  console.warn = () => {};
  try {
    const stack = new MultiCloudBackendStack(Testing.app(), "app");
    return JSON.parse(Testing.synth(stack));
  } finally {
    console.log = log;
    console.warn = warn;
    Object.assign(settings, original);
  }
}

/** Returns JSON with object keys sorted recursively (stable comparison). */
export function canonicalize(value: any): any {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

const REFERENCE = /\$\{((?:data\.)?[a-z0-9_]+\.[A-Za-z0-9_-]+)/g;

/**
 * Builds the dependency graph of a synthesized stack from both explicit
 * `depends_on` entries and attribute references (`${type.name...}`).
 */
export function buildDependencyGraph(synth: any): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const blocks: Array<[string, any]> = [
    ["", synth.resource ?? {}],
    ["data.", synth.data ?? {}],
  ];
  for (const [prefix, block] of blocks) {
    for (const [type, instances] of Object.entries<any>(block)) {
      for (const [name, body] of Object.entries<any>(instances)) {
        const address = `${prefix}${type}.${name}`;
        const { depends_on: dependsOn = [], ...attributes } = body;
        const deps = new Set<string>(dependsOn);
        for (const match of JSON.stringify(attributes).matchAll(REFERENCE)) {
          deps.add(match[1]);
        }
        deps.delete(address);
        graph.set(address, deps);
      }
    }
  }
  return graph;
}

/** Returns one dependency cycle (as a list of addresses), or undefined. */
export function findDependencyCycle(
  graph: Map<string, Set<string>>,
): string[] | undefined {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const visit = (node: string): string[] | undefined => {
    state.set(node, "visiting");
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      if (!graph.has(dep)) continue;
      if (state.get(dep) === "visiting") {
        return [...stack.slice(stack.indexOf(dep)), dep];
      }
      if (!state.has(dep)) {
        const cycle = visit(dep);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    state.set(node, "done");
    return undefined;
  };

  for (const node of graph.keys()) {
    if (!state.has(node)) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }
  return undefined;
}
