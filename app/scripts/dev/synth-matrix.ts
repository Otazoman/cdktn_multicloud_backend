/**
 * Before/after comparison of the synthesized stack for refactoring.
 *
 * Usage (from app/):
 *   npx ts-node scripts/dev/synth-matrix.ts synth <out.json>
 *   npx ts-node scripts/dev/synth-matrix.ts compare <before.json> <after.json> [--ignore-depends-on]
 *
 * Typical flow: run `synth` before a change, make the change, run `synth`
 * again, then `compare`. A pure refactoring must report "IDENTICAL".
 *
 * The output files contain secrets from config/.env. Write them to an
 * ignored location (e.g. cdktf.out/) and never commit them.
 */
import * as fs from "fs";
import {
  buildDependencyGraph,
  buildMatrixCases,
  canonicalize,
  findDependencyCycle,
  synthCase,
} from "./synthMatrix";

function synth(outFile: string): void {
  const result: Record<string, any> = {};
  for (const matrixCase of buildMatrixCases()) {
    try {
      result[matrixCase.name] = canonicalize(synthCase(matrixCase));
    } catch (e: any) {
      result[matrixCase.name] = { __error: String(e?.message ?? e) };
    }
  }
  fs.writeFileSync(outFile, JSON.stringify(result));
  const errors = Object.entries(result).filter(([, v]) => v.__error);
  console.log(`cases=${Object.keys(result).length} errors=${errors.length}`);
  errors.forEach(([name, v]) => console.log(`  ${name}: ${v.__error}`));
}

function stripDependsOn(value: any): any {
  if (Array.isArray(value)) return value.map(stripDependsOn);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "depends_on")
        .map(([key, v]) => [key, stripDependsOn(v)]),
    );
  }
  return value;
}

function compare(
  beforeFile: string,
  afterFile: string,
  ignoreDependsOn: boolean,
): void {
  const before = JSON.parse(fs.readFileSync(beforeFile, "utf8"));
  const after = JSON.parse(fs.readFileSync(afterFile, "utf8"));
  let ok = true;

  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[name];
    const a = after[name];
    if (!b || !a || a.__error || b.__error) {
      console.log(`${name}: MISSING OR ERROR`);
      ok = false;
      continue;
    }
    const same = ignoreDependsOn
      ? JSON.stringify(stripDependsOn(b)) === JSON.stringify(stripDependsOn(a))
      : JSON.stringify(b) === JSON.stringify(a);
    const cycle = findDependencyCycle(buildDependencyGraph(a));
    if (!same || cycle) {
      ok = false;
      console.log(
        `${name}: ${same ? "same" : "DIFFERENT"}` +
          (cycle ? ` CYCLE ${cycle.join(" -> ")}` : ""),
      );
    }
  }
  console.log(ok ? "IDENTICAL (no cycles)" : "DIFFERENCES FOUND");
  process.exitCode = ok ? 0 : 1;
}

const [command, ...args] = process.argv.slice(2);
if (command === "synth" && args[0]) {
  synth(args[0]);
} else if (command === "compare" && args[0] && args[1]) {
  compare(args[0], args[1], args.includes("--ignore-depends-on"));
} else {
  console.error(
    "Usage: synth <out.json> | compare <before.json> <after.json> [--ignore-depends-on]",
  );
  process.exitCode = 2;
}
