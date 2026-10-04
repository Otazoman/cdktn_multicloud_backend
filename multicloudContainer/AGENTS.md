# AI Development Rules

## 1. Project Overview

This project uses:

- cdktn
- TypeScript
- AWS
- Microsoft Azure
- Google Cloud
- Site-to-Site VPN

The project root is:

```text
/app
```

The project is designed as a multi-cloud infrastructure provisioning system.

---

## 2. Language and Communication

### 2.1 Internal Reasoning

Perform reasoning, analysis, investigation, and technical consideration in English whenever practical.

Use English for:

- technical reasoning
- problem analysis
- architecture evaluation
- debugging analysis
- comparing implementation approaches
- identifying root causes
- evaluating trade-offs

Do not expose internal chain-of-thought or private reasoning to the user.

### 2.2 User-Facing Communication

All user-facing explanations, reports, questions, proposals, and discussions should be written in Japanese unless the user explicitly requests another language.

Technical terms, commands, code, API names, resource names, class names, function names, and file paths may remain in their original form.

When explaining technical matters in Japanese:

- Explain the conclusion clearly.
- Explain the reason and supporting evidence.
- Distinguish confirmed facts from assumptions.
- Clearly identify uncertainty when something cannot be confirmed.
- Avoid unnecessary verbosity.
- Do not present guesses as facts.

### 2.3 Code and Documentation Language

Follow the existing project convention for source code and documentation.

Unless the project explicitly specifies otherwise:

- Source-code comments should be written in English.
- JSDoc should be written in English.
- Identifiers should use English.
- User-facing explanations should be written in Japanese.

---

## 3. Core Principles

### 3.1 Investigate Before Changing

Do not modify code immediately.

Before making a non-trivial change:

1. Inspect the relevant files.
2. Understand the existing architecture.
3. Trace related configuration, resources, constructs, providers, and stacks.
4. Check relevant type definitions, provider versions, dependencies, and documentation when necessary.
5. Identify the actual cause of the problem.
6. Explain the proposed change before implementation.

Never make assumptions when the required information can be verified from the code, configuration, documentation, type definitions, or existing implementation.

### 3.2 Do Not Guess

Never invent:

- configuration values
- resource names
- APIs
- provider properties
- dependency relationships
- file locations
- existing behavior
- infrastructure requirements
- cloud service behavior
- library behavior
- version-specific features

If something is unclear:

1. Investigate it using available sources.
2. If it still cannot be confirmed, clearly state the uncertainty.
3. Ask the user when a decision is required.

Do not present an assumption as a confirmed fact.

### 3.3 Preserve Existing Design

The existing architecture, design, interfaces, configuration model, and coding conventions must be preserved unless the user explicitly approves a change.

Do not introduce a different architecture simply because it appears cleaner, simpler, or more modern.

Do not perform:

- unnecessary refactoring
- modernization
- optimization
- renaming
- abstraction
- dependency replacement
- directory restructuring
- configuration restructuring

unless it is necessary for the requested change or explicitly approved.

### 3.4 Better Practices

If a better design, architecture, implementation, or best practice is identified:

1. Explain the current implementation.
2. Explain the problem or limitation.
3. Explain the proposed improvement.
4. Explain the affected files.
5. Explain alternatives and trade-offs.
6. Wait for explicit user approval.
7. Only then implement the improvement.

Finding a better solution does NOT authorize changing the existing design.

---

## 4. Change Approval Policy

Explicit user approval is required before making non-trivial changes involving:

- architecture
- resource dependency design
- cloud networking
- VPN topology
- IAM
- authentication / authorization
- security settings
- public/private network exposure
- API interfaces
- data models
- configuration structure
- provider changes
- dependency changes
- new packages
- removal of packages
- large refactoring
- resource replacement
- production infrastructure
- potentially costly cloud resources
- destructive operations
- database changes
- state changes

When approval is required, do not implement the change first.

Before requesting approval, provide enough information for the user to make an informed decision.

---

## 5. Minimal Change Policy

Prefer the smallest change that correctly solves the requested problem.

Do not modify unrelated files.

Do not rewrite working code unnecessarily.

Do not change formatting throughout a file merely because the existing formatting differs from the preferred style.

Do not combine unrelated improvements into the same change.

Do not use a requested bug fix as an opportunity to perform unrelated cleanup.

If additional improvements are identified, report them separately and do not implement them without approval when they fall under the Change Approval Policy.

---

## 6. Project Architecture

The project follows this general dependency direction:

```text
config
   ↓
resources
   ↓
constructs

stacks
   ↓
resources

providers
   ↓
resources
```

The responsibilities of each layer must be preserved.

### 6.1 config

Responsible for resource configuration.

Configuration should describe:

- whether resources are enabled
- what resources should be created
- resource parameters
- resource-specific settings
- tags / labels where applicable

Do not put resource creation logic in configuration files.

### 6.2 resources

Responsible for:

- reading configuration
- enable/disable decisions
- composing constructs
- passing configuration to constructs
- passing providers to constructs
- controlling resource relationships

Resources may import:

- config
- constructs
- providers
- shared interfaces

Resources must not import stacks.

Resource-level orchestration should remain in this layer.

### 6.3 constructs

Responsible for individual resource definitions.

A construct should generally represent one resource or one clearly defined resource unit.

Constructs:

- receive configuration through constructor arguments
- receive providers through constructor arguments
- should not import project configuration directly
- should not import stacks
- should not import providers directly when the provider can be passed as an argument
- should not import other constructs unless explicitly required by the existing architecture
- should not contain resource enable/disable decisions
- should not manage application state
- should not introduce unrelated side effects

Resource composition and orchestration should generally remain in `resources`.

### 6.4 stacks

Responsible for orchestration.

Stacks should primarily connect resources together.

Stacks:

- may import resources
- must not directly import constructs
- must not directly import configuration
- must not directly import providers
- should not contain individual resource implementation logic

Stack-level conditional logic should be limited to project-wide/common settings where appropriate.

---

## 7. Project Structure

The current project structure is approximately:

```text
/app
├── __tests__
├── config
│   ├── aws
│   ├── azure
│   ├── google
│   └── commonsettings.ts
├── constructs
│   ├── dns
│   │   ├── publiczone
│   │   └── privatezones
│   ├── relationaldatabases
│   ├── vmresources
│   ├── vpnresources
│   └── vpcnetwork
├── providers
├── resources
├── stacks
├── pubkey
├── scripts
└── app.ts
```

Do not restructure this directory layout without explicit approval.

The actual repository structure takes precedence over this documentation if the structure has legitimately changed. If there is a discrepancy, investigate it before making changes.

---

## 8. Configuration Rules

Configuration files are TypeScript files.

Prefer configuration files to contain configuration data rather than implementation logic.

### 8.1 commonsettings.ts

`commonsettings.ts` contains project-wide control parameters.

Do not put cloud-specific resource configuration here unless there is a clear project-wide reason.

### 8.2 Cloud-Specific Configuration

Cloud-specific directories contain resource-specific configuration.

Example:

```text
config/
├── aws/
├── azure/
└── google/
```

Resource configuration should support the existing project's enable/disable pattern.

Where the existing design supports multiple resources of the same type, preserve that pattern.

Examples include:

- multiple VMs
- multiple databases
- multiple DNS records
- multiple CNAME records
- multiple A records

Tags and labels should remain configurable according to the existing project design.

Do not change the configuration model without approval.

---

## 9. Coding Standards

Use TypeScript.

Follow the existing ESLint and Prettier configuration.

Do not introduce a competing coding style.

Use:

- `camelCase` for variables, functions, and properties
- `PascalCase` for classes and constructs
- `UPPER_SNAKE_CASE` for constants where the project convention requires it

Use `import` rather than `require`.

Prefer type-safe implementations.

Explicitly define types when doing so improves clarity, safety, or is required by the existing code.

Do not add redundant type annotations merely for the sake of adding types.

Use meaningful names.

Avoid unnecessary nesting of `if` statements and loops.

Avoid magic numbers and strings when constants improve maintainability.

Comments should be written in English.

Use JSDoc where appropriate.

Do not leave commented-out obsolete code.

Follow existing project conventions when they differ from these general rules.

---

## 10. Abstraction and Commonization

Avoid unnecessary duplication.

However, do not automatically create:

- utility classes
- helper functions
- base classes
- generic abstractions
- factories
- new modules

simply because similar code exists.

Before introducing an abstraction, consider whether it actually improves the existing architecture.

Prefer simple, local solutions when abstraction does not provide a clear benefit.

Large-scale commonization or refactoring requires explicit approval.

---

## 11. Error Handling

Implement appropriate error handling.

Do not hide errors merely to make execution succeed.

Do not silently ignore failures.

Do not change error handling behavior unrelated to the requested change.

When an error is caused by:

- configuration
- provider behavior
- cloud service behavior
- dependency behavior
- version differences
- environment configuration

identify the actual cause before changing code.

When possible, distinguish between:

- application/code errors
- configuration errors
- infrastructure errors
- provider/type-definition errors
- environment errors
- external service errors

---

## 12. Dependencies

Do not add, remove, or replace npm packages without explicit approval unless the change is absolutely required to complete the explicitly requested task.

Before proposing a dependency change, explain:

- why it is required
- what it provides
- alternatives
- maintenance implications
- impact on the existing project
- potential version compatibility issues

Do not upgrade dependencies merely because newer versions are available.

Preserve existing dependency versions unless a version change is required and approved.

---

## 13. Infrastructure Safety

This project manages cloud infrastructure.

Be conservative with infrastructure changes.

Never assume that a destructive operation is acceptable.

Do not execute or recommend destructive commands without clearly explaining their consequences.

Examples requiring explicit confirmation include:

- resource deletion
- database deletion
- replacement of production resources
- Terraform/cdktn state manipulation
- network topology changes
- VPN changes
- IAM permission changes
- security group / NSG changes
- public exposure changes
- DNS changes
- route changes
- firewall changes
- storage deletion
- changes that may cause service interruption
- changes that may increase cloud costs significantly

When infrastructure behavior is uncertain, investigate provider documentation and the existing implementation before proposing a change.

---

## 14. Commands

Do NOT run:

```bash
npm run build
```

Do NOT run cdktn deployment commands on behalf of the user.

The user executes cdktn commands.

Examples:

```bash
cdktn synth
cdktn diff
cdktn deploy
cdktn destroy
```

If validation requires one of these commands, tell the user which command should be executed and what result should be checked.

Read-only investigation commands may be used when appropriate.

Commands that modify files, infrastructure, Git history, or other persistent state should be treated conservatively.

---

## 15. Tests

Do not modify tests merely to make them pass.

When a test fails:

1. Determine whether the implementation is wrong.
2. Determine whether the test expectation is outdated.
3. Determine whether the environment or dependency is responsible.
4. Explain the cause.
5. Change the test only when the expected behavior itself should change.

Preserve existing snapshot-test conventions.

Do not update snapshots blindly.

When a snapshot changes, explain why the expected infrastructure definition changed.

---

## 16. Existing User Changes

Never overwrite or discard user changes.

Before modifying a file, consider whether it contains changes that are unrelated to the current task.

Do not use commands that discard working-tree changes unless explicitly approved.

Do not:

- reset the working tree
- restore files
- clean untracked files
- overwrite user changes
- revert unrelated modifications

automatically.

If existing uncommitted changes affect the requested work, inspect them and explain the situation before proceeding when necessary.

---

## 17. Git

Do not automatically:

- commit
- push
- reset
- rebase
- force push
- rewrite history
- delete branches

These actions require explicit user approval.

Do not create commits merely because implementation is complete.

If the user requests a commit, clearly report what will be committed before executing the operation when appropriate.

---

## 18. Secrets and Sensitive Information

Never expose or commit:

- passwords
- private keys
- API tokens
- access keys
- client secrets
- credentials
- connection strings containing secrets

Do not print secrets in logs or command output unnecessarily.

If credentials are required, ask the user to provide or configure them through an appropriate secure mechanism.

Do not copy secrets into source code, configuration files, documentation, test fixtures, or examples.

When inspecting configuration files, avoid reproducing sensitive values in the response.

---

## 19. Before Implementation

For non-trivial changes, report:

### Current Understanding

What the existing implementation does.

### Problem

What is currently wrong or what requirement is missing.

### Root Cause

What evidence indicates the cause of the problem.

If the root cause cannot yet be confirmed, explicitly state that it is still under investigation.

### Proposed Change

What should be changed and why.

### Affected Files

List the files expected to be modified.

For each file, explain its role in the change.

### Alternatives

Mention materially different approaches when relevant.

Explain important trade-offs.

### Approval

Wait for explicit user approval before implementing changes that fall under the Change Approval Policy.

Do not interpret silence, uncertainty, or a general request for investigation as approval to implement a significant design change.

---

## 20. After Implementation

Report:

### Changed Files

List every modified file.

For each file, identify the relevant:

- class
- function
- construct
- configuration
- section

### Changes

Briefly explain:

- what was changed
- why it was changed
- how it fits the existing architecture

### Validation

Explain what was checked.

Examples:

- static inspection
- TypeScript diagnostics
- unit tests
- snapshot comparison
- linting
- formatting
- read-only commands

Do not claim that a command was executed if it was not executed.

### Remaining Issues

Clearly identify unresolved problems.

Do not hide known limitations.

### Further Improvements

If additional improvements are possible, list them separately.

Do not implement them unless explicitly approved.

---

## 21. General Rule

When uncertain:

**Investigate first.**

When the cause is unclear:

**Gather evidence before concluding.**

When a design change is appropriate:

**Propose first.**

When approval is required:

**Wait for approval.**

When implementing:

**Make the smallest correct change.**

When reporting:

**Clearly identify what changed and what was verified.**

The AI is responsible for providing analysis, proposals, and implementation assistance.

The user retains final authority over architecture, design decisions, infrastructure changes, and significant modifications.
