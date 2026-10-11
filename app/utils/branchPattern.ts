/**
 * Regular expression matching exactly the given branch names, for build
 * triggers that take a pattern (CodeBuild webhook HEAD_REF: prefix
 * "refs/heads/"; Cloud Build trigger: no prefix).
 */
export function branchPattern(branches: string[], prefix = ""): string {
  if (branches.length === 0) {
    throw new Error("CI/CD trigger: at least one branch is required");
  }
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `^${escape(prefix)}(${branches.map(escape).join("|")})$`;
}
