# Project Rules

## Project

- CDKTN + TypeScript
- AWS / Azure / Google Cloud
- Site-to-Site VPN
- Project root: `/app`

## Architecture

config → resources → constructs
↑
stacks

### config

- Define resource configuration.
- `commonsettings.ts`: global project-level settings.
- `aws/`, `azure/`, `google/`: cloud-specific resource settings.
- Resource enable/disable flags belong here.

### resources

- Compose constructs.
- Import configuration, providers, and constructs.
- Control resource enable/disable.
- Do not import stacks.

### constructs

- Define individual resources.
- Do not import config, providers, stacks, or other constructs.
- Do not control resource enable/disable.
- Keep constructs focused and reusable.

### stacks

- Orchestrate resources.
- Import resources only.
- Do not contain resource implementation logic.
- Global enable/disable logic may be controlled by `commonsettings.ts`.

## Coding

- TypeScript only.
- Follow existing project conventions.
- Variables/functions/classes: camelCase.
- Constants: UPPER_SNAKE_CASE.
- Comments: English; use JSDoc where appropriate.
- Use `import`, not `require`.
- Follow ESLint/Prettier configuration.
- Prefer type safety; avoid unnecessary `any`.
- Avoid unnecessary abstraction and refactoring.

## Change Policy

- Investigate before modifying.
- Do not guess.
- Do not modify unrelated code.
- Do not change architecture or design without user approval.
- Better practices may be proposed but must not be implemented without explicit approval.
- Before non-trivial changes, explain the proposed change and affected files and obtain approval.

## Restrictions

- Do not run `npm build`.
- Do not run `cdktf` commands; the user runs them.
- Do not perform destructive operations without approval.
- Do not commit or push without approval.

## Reporting

- Record every code change in the existing change-history mechanism.
- Always report changed file paths and the relevant class/function/construct.
- Report validation results and unresolved issues after changes.
