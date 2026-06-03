# AGENTS.md — side-pilot Root Contract

This file is the root operational contract for the side-pilot project.
All AI tools working on this project must read this file before starting any work.
This file overrides any tool-specific adapter on conflict.

---

## Project

Cross-platform desktop (macOS + Windows) floating AI assistant. Routes user prompts to local CLI tools (Claude Code CLI, OpenAI Codex CLI, Gemini CLI) via the Rust core (`std::process::Command` / `tauri-plugin-shell`). Built with **Tauri (Rust) + React + TypeScript**.

Primary design specification: `docs/idea.md`
Project profile: `.claude/docs/project_specification.md`

---

## Task Classification

Before any file is created, edited, or deleted, classify the task out loud:

**Trivial** — single-step, low-risk, no behavioral change.
Proceed directly. State the classification.

**Non-trivial** — multi-step, or changes behavior, structure, commands, contracts, or domain facts:
1. Stop.
2. Load `.claude/manager/MANAGER.md`.
3. Do not implement until the manager emits its visible routing plan (`Manager: manager - output below`).

When unsure, treat as non-trivial.

When a session begins as discussion and the user signals readiness to proceed ("go ahead", "do it", "implement it", "fix it", or equivalent), this classification gate fires again. That signal is not permission to skip it.

---

## Beads Planning Gate

For applicable non-trivial work, the manager must route through `.claude/skills/work-with-bead/SKILL.md` before implementation starts.

The Beads gate applies to non-trivial product or engineering work unless the task is one of these exempt categories:
- documentation-only work
- AI staff work, including instruction artifacts, skills, pipelines, agents, manager routing, root contracts, and AI-tool governance
- bug triage
- bug fixes

When the Beads gate applies:
- check whether a relevant Beads item already exists
- if one exists, use it as the planning/work item
- if none exists, stop and ask the user whether to create the relevant epic, feature, or task before continuing
- never create a Beads item for trivial or exempt work

---

## Quality Gates

These apply to all non-trivial work and may not be skipped:

- **TDD is required** for all non-trivial logic (CLI adapters, routing layer, session model, local storage). Write tests before writing implementation code: Red → Green → Refactor. Front-end: Vitest + React Testing Library; Rust core: cargo-nextest (`#[tokio::test]`, `mockall`). A feature is not done until tests pass.
- UI changes tested manually; state this explicitly.
- Documentation maintenance required after any change that affects behavior, interfaces, commands, architecture, or domain facts.
- Local validation required before a feature closes: the touched layers build and all tests pass (`npm run test` for the front-end, `cargo nextest run` for the Rust core).

---

## Instruction System Changes

When creating or materially changing any instruction artifact:
- Use `instruction-evaluator` before accepting the artifact.
- Use `artifact-acceptance-tester` before accepting any skill, pipeline, agent, manager routing, validation gate, or output contract.

---

## Capability Registry

### Manager
- `.claude/manager/MANAGER.md` — classifies and routes non-trivial work; enforces documentation maintenance and task-complete

### Skills
- `.claude/skills/brainstorm/SKILL.md` — open design decisions with meaningful trade-offs
- `.claude/skills/implement-tauri-feature/SKILL.md` — implement a Tauri/React/Rust feature with tests
- `.claude/skills/react-tauri-expert/SKILL.md` — review, improve, and implement React + TypeScript + Tauri v2 code; Topic Router over windowing, IPC/permissions, state, performance, accessibility, cross-platform conventions
- `.claude/skills/testing-pro/SKILL.md` — write and review tests across both layers (Vitest front-end + cargo-nextest Rust core); enforces unit test quality gate
- `.claude/skills/triage-bug/SKILL.md` — investigate a reported bug: gather, reproduce, root-cause, classify severity, decide disposition; produces triage report; writes no production code
- `.claude/skills/verify-cli-adapter/SKILL.md` — verify CLI adapter correctness after implementation
- `.claude/skills/work-with-bead/SKILL.md` — check, create, update, and maintain Beads work items for applicable non-trivial work
- `.claude/skills/work-with-git/SKILL.md` — select or create the appropriate task branch and enforce commit/push boundaries
- `.claude/skills/documentation-maintenance/SKILL.md` — post-change documentation updates
- `.claude/skills/task-complete/SKILL.md` — closure reporting for non-trivial routed work

### Pipelines
- `.claude/pipelines/implement-feature.md` — Tauri/React/Rust feature implementation
- `.claude/pipelines/implement-cli-adapter.md` — CLI adapter (Rust core) implementation
- `.claude/pipelines/triage-bug.md` — bug investigation, classification, and disposition routing
- `.claude/pipelines/fix-bug.md` — TDD-ordered bug fix for confirmed, root-caused defects

### Agents
- `.claude/agents/instruction-evaluator.md` — review instruction artifacts for quality and compliance
- `.claude/agents/artifact-acceptance-tester.md` — acceptance-test new or changed instruction artifacts
- `.claude/agents/code-reviewer.md` — review implementation diffs for correctness, TDD adherence, and project conventions

### Conventions
- `.claude/conventions/react-tauri/` — project-wide React + TypeScript + Tauri v2 conventions for windowing, IPC/permissions, state, performance, accessibility, and cross-platform behavior

---

## Authoritative Sources

| Source | Purpose |
|---|---|
| `docs/idea.md` | Primary design specification — single source of truth for features, MVP scope, architecture intent |
| `.claude/docs/project_specification.md` | Project profile — role, duties, quality expectations, domain vocabulary |
| `README.md` | Developer guide — prerequisites, build/dev/test commands, source layout, cross-platform notes |
| `src-tauri/src/main.rs` | Tauri/Rust core entry point — calls `side_pilot_lib::run()` |
| `src-tauri/src/lib.rs` | Tauri core library — builder, command registration, module map (`commands`, `adapters`, `storage`) |
| `src/App.tsx` | React UI root — renders the floating `Bubble` |
