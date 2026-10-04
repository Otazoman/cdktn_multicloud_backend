import { TerraformDataSource, TerraformResource, dependable } from "cdktn";
import { Construct } from "constructs";

/**
 * Adds Terraform `depends_on` entries to `dependent`.
 *
 * IMPORTANT: `construct.node.addDependency()` is NOT rendered into
 * `depends_on` by cdktn, so it has no effect on the Terraform graph. Use this
 * helper whenever Terraform must order resources that do not reference each
 * other through attributes (typically to get a correct destroy order).
 *
 * Both `dependent` and `dependencies` may be:
 *   - a Terraform resource (or data source, for dependencies only)
 *   - a Construct (every Terraform resource inside it is used)
 *   - an array, or a plain object whose values are any of the above
 *     (e.g. the VPC output object returned by a construct function)
 *   - undefined / null (ignored)
 *
 * Data sources are never used as `dependent`: `depends_on` on a data source
 * defers its read until apply time, which causes perpetual diffs.
 */
export function addTerraformDependency(
  dependent: unknown,
  ...dependencies: unknown[]
): void {
  const targets = collectTerraformElements(dependent, false);
  const deps = collectTerraformElements(dependencies, true);

  for (const target of targets) {
    const added = addedDependencies.get(target) ?? new Set();
    const newEntries: string[] = [];
    for (const dep of deps) {
      if (dep !== target && !added.has(dep)) {
        added.add(dep);
        // `dependable()` renders the plain address (e.g. "aws_vpc.main"),
        // the same form cdktn uses for the `dependsOn` constructor option.
        newEntries.push(dependable(dep));
      }
    }
    addedDependencies.set(target, added);
    if (newEntries.length > 0) {
      target.dependsOn = [...(target.dependsOn ?? []), ...newEntries];
    }
  }
}

type TerraformElementWithDependsOn = TerraformResource | TerraformDataSource;

// Dependencies already added through this helper, per dependent resource.
// Used to avoid duplicate entries (token strings cannot be compared).
const addedDependencies = new WeakMap<
  TerraformElementWithDependsOn,
  Set<TerraformElementWithDependsOn>
>();

function collectTerraformElements(
  value: unknown,
  includeDataSources: boolean,
  seen: Set<unknown> = new Set(),
): TerraformElementWithDependsOn[] {
  if (value === null || value === undefined || seen.has(value)) {
    return [];
  }
  if (typeof value !== "object") {
    return [];
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return dedupe(
      value.flatMap((v) =>
        collectTerraformElements(v, includeDataSources, seen),
      ),
    );
  }
  if (TerraformResource.isTerraformResource(value)) {
    return [value];
  }
  if (TerraformDataSource.isTerraformDataSource(value)) {
    return includeDataSources ? [value] : [];
  }
  if (Construct.isConstruct(value)) {
    return value.node
      .findAll()
      .filter(
        (c): c is TerraformElementWithDependsOn =>
          TerraformResource.isTerraformResource(c) ||
          (includeDataSources && TerraformDataSource.isTerraformDataSource(c)),
      );
  }
  if (Object.getPrototypeOf(value) === Object.prototype) {
    return dedupe(
      Object.values(value).flatMap((v) =>
        collectTerraformElements(v, includeDataSources, seen),
      ),
    );
  }
  return [];
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}
