# AGENTS.md — side-pilot Root Contract

This file is the root operational contract for the side-pilot project.
All AI tools working on this project must read this file before starting any work.
This file overrides any tool-specific adapter on conflict.

---

## Project

Cross-platform desktop (macOS + Windows) floating AI assistant. Routes user prompts to local CLI tools (Claude Code CLI, OpenAI Codex CLI, Gemini CLI) via the Rust core (`std::process::Command` / `tauri-plugin-shell`). Built with **Tauri (Rust) + React + TypeScript**.

Primary design specification: `docs/idea.md`
Implemented architecture reference: `docs/architecture/README.md`
Project profile: `.claude/docs/project_specification.md`

---

## Task Classification

Before making any tool call that reads, writes, or modifies project files in response to a task request — classify the task out loud:

**Trivial** — single-step, low-risk, no behavioral change.
Proceed directly. State the classification.

**Non-trivial** — multi-step, or changes behavior, structure, commands, contracts, or domain facts:
1. Stop.
2. Load `.claude/skills/task-routing/SKILL.md`.
3. Do not implement until the manager emits its visible routing plan (`Manager: manager - output below`).

Non-trivial by default (no judgment required): any numbered list of issues to fix, any change touching more than one element, any UI or interaction change.

When unsure, treat as non-trivial.

Any user request to create, modify, or delete a file is an implicit "proceed" signal — classify it before acting, regardless of phrasing. A direct imperative ("modify ci.yml", "fix the test", "update the docs") carries the same obligation as "go ahead" or "implement it."

After a `Skill: task-complete` closure, every subsequent action request in the same session re-triggers the classification gate. A prior closure does not authorize skipping classification for the next request.

Requirements discovery, scoping, feature refinement, and re-scoping an existing Beads item are non-trivial tasks in their own right. Load the manager immediately for this work — do not wait for an implementation signal.

---

## Beads Planning Gate

For applicable non-trivial work, the manager routes through `.claude/skills/work-with-bead/SKILL.md` before implementation starts. The manager owns the exempt categories list.

When the Beads gate applies:
- check whether a relevant Beads item already exists
- if one exists, use it as the planning/work item
- if none exists, stop and ask the user whether to create the relevant epic, feature, or task before continuing
- never create a Beads item for trivial or exempt work

---

## Quality Gates

These apply to all non-trivial work and may not be skipped:

- **TDD required** for non-trivial logic. Red → Green → Refactor. Front-end: Vitest + React Testing Library; Rust: cargo-nextest + tokio + mockall.
- **Interaction contract first (UI):** state the contract before writing component code. Name the default/initial state and define success as a user-visible outcome.
- **Runtime UI validation required** for any UI or interaction change. Exercise in the real Tauri window (WKWebView) or the WebKit E2E harness. Captured evidence (screenshot, measured sizes). Vitest + jsdom is not sufficient.
- **Documentation maintenance** after any change that affects behavior, interfaces, commands, architecture, or domain facts.
- **Local validation** before a feature closes: touched layers must build and tests must pass.
- **test-runner agent** for non-trivial routed validation. Direct command execution is allowed only for trivial requests.
- **design-reviewer agent** for non-trivial UI or icon work.

### Test Pyramid and Quality Practices

Test taxonomy and quality practice standards are defined in `.claude/conventions/testing-taxonomy.md` — the single authoritative source. All instruction artifacts reference it; none duplicate it.

Binding policy:

- **TDD required** for non-trivial logic. Red → Green → Refactor per the test pyramid levels.
- **Coverage thresholds** must pass (80% lines, branches, functions, statements).
- **Dependency auditing** must pass (no high/critical advisories).
- **Smoke tests** must tag critical-path tests and pass before full suite invocation.
- **Property-based, accessibility, and contract tests** must be present for all new features touching parsing, UI components, or IPC types respectively.
- **Mutation testing** must pass on `feature/*` branches.
- **Static analysis** must pass with zero errors.

For non-trivial routed work, quality practice validations must be executed through the **test-runner agent** — direct command execution is allowed only for trivial requests.

---

## Agent Execution Mode

Dedicated agents are first-class executors. They MUST be spawned as real subagents when a gate requires them. Inline substitution is prohibited. See `.claude/skills/task-routing/SKILL.md` for enforcement.

---

## Platform Asset Boundary

side-pilot targets **macOS and Windows only**. No iOS/Android assets. Desktop icons must keep the source asset plus macOS/Windows outputs only.

---

## Instruction System Changes

When creating or materially changing any instruction artifact:
- Use `instruction-evaluator` before accepting the artifact.
- Use `artifact-acceptance-tester` before accepting any skill, pipeline, agent, manager routing, validation gate, or output contract.

---

## Final Response Gate

For non-trivial routed work, the final response must include:

- `Skill: task-complete - output below`
- `Agent: test-runner - output below` when validation was required
- `Agent: instruction-evaluator - output below` and `Agent: artifact-acceptance-tester - output below` when instruction artifacts changed

Compact artifacts must preserve the label, status/verdict, and required table shape. Each `Agent:` artifact must originate from an actually spawned subagent.

---

## References

- Full capability registry: `.claude/docs/capabilities.md`
- Authoritative sources: `.claude/docs/project_specification.md` §Authoritative Local Sources
