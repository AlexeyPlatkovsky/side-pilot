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
- **Interaction contract first (UI):** before implementing a UI surface, state its interaction contract and treat it as acceptance criteria — drag surfaces and click-vs-drag behavior, keyboard (Enter/Shift+Enter/Esc/focus moves), sizing (default rows, max, scroll vs. pin, reflow on window resize), empty/loading/error states, and any known WebKit quirks. Discovering these in the running app after the fact is the failure mode this gate exists to prevent.
- **Runtime UI validation is required** for any UI or interaction change — it is a blocker, not a footnote. The change must be exercised in the real Tauri window (WKWebView), or in the WebKit end-to-end harness (planned, Phase 2) once it exists, with captured evidence (screenshot or recording, plus measured sizes/positions where relevant). Passing `npm run test` is necessary but **not sufficient**: Vitest + jsdom does not render layout, cannot measure element size/scroll, cannot exercise `data-tauri-drag-region` or window dragging, and does not reproduce WebKit-specific rendering. A Chromium-only preview does not satisfy this for WebKit-sensitive changes. State the runtime evidence explicitly; if it could not be produced, say so and treat the work as unvalidated.
- Documentation maintenance required after any change that affects behavior, interfaces, commands, architecture, or domain facts.
- Local validation required before a feature closes: the touched layers build and all tests pass (`npm run test` for the front-end, `cargo nextest run` for the Rust core).
- For non-trivial routed work, testing/validation evidence must come from the dedicated `test-runner` agent. Directly running a single command is allowed only for trivial requests such as "run npm test".
- Non-trivial UI or icon work must be reviewed by the dedicated `design-reviewer` agent in addition to code review.

---

## Agent Execution Mode

Dedicated agents are first-class executors, not optional helpers. Every registered agent — `test-runner`, `code-reviewer`, `design-reviewer`, `instruction-evaluator`, `artifact-acceptance-tester`, and any agent added later — MUST be run as a real spawned subagent through the Agent/Task tool whenever work routes to it or a gate requires it.

- Inline substitution is prohibited: the main thread must not simulate, paraphrase, or stand in for an agent's validation or review in its own voice.
- This holds even when a tool-specific adapter or runtime default discourages spawning subagents. As the root contract, this rule overrides those defaults (see `CLAUDE.md`).
- An `Agent: <name> - output below` artifact asserts that the named subagent was actually spawned via the Agent/Task tool. Emitting that artifact for work the main thread performed inline is a prohibited substitution, not compliance. If a subagent could not be spawned, do not emit its artifact — report the blocker instead.
- Single exception: the user explicitly directs inline execution for a specific task (for example "review this inline" or "don't spawn a subagent"). A general request to do the work is not such a direction. An inline run permitted under this exception must still emit the agent's labeled output artifact and be disclosed as inline in the response.
- If an agent genuinely cannot be spawned in the current environment, stop and report it as a blocker rather than silently substituting an inline result.

---

## Platform Asset Boundary

side-pilot is a desktop app targeting **macOS and Windows only**.

- Do not create, keep, or commit iOS or Android generated assets unless the user explicitly changes the target platform scope.
- `src-tauri/icons/ios/` and `src-tauri/icons/android/` are not valid desktop deliverables.
- App icon generation must keep the source asset plus desktop-relevant outputs for macOS and Windows packaging.
- If a generator creates mobile assets by default, remove them before validation and make the cleanup visible in the task report.

---

## Instruction System Changes

When creating or materially changing any instruction artifact:
- Use `instruction-evaluator` before accepting the artifact.
- Use `artifact-acceptance-tester` before accepting any skill, pipeline, agent, manager routing, validation gate, or output contract.

---

## Final Response Gate

For non-trivial routed work, the final response must include the required closure artifacts, not merely summarize them or rely on earlier commentary messages.

At minimum include compact versions of:
- `Skill: task-complete - output below`
- `Agent: test-runner - output below` when validation was required
- `Agent: instruction-evaluator - output below` and `Agent: artifact-acceptance-tester - output below` when instruction artifacts, routing, validation gates, or output contracts changed

Compact artifacts must preserve the label, status/verdict, and required table shape. If any required final artifact is missing from the final response draft, revise the final response before sending.

Each required `Agent:` artifact must originate from an actually spawned subagent (see "Agent Execution Mode"); a main-thread-authored stand-in does not satisfy this gate.

---

## Capability Registry

### Manager
- `.claude/manager/MANAGER.md` — classifies and routes non-trivial work; enforces documentation maintenance and task-complete

### Skills
- `.claude/skills/brainstorm/SKILL.md` — open design decisions with meaningful trade-offs
- `.claude/skills/design/SKILL.md` — apply and maintain the design system (CSS tokens) and keep `docs/design-book.md` in sync
- `.claude/skills/implement-tauri-feature/SKILL.md` — implement a Tauri/React/Rust feature with tests
- `.claude/skills/react-tauri-expert/SKILL.md` — review, improve, and implement React + TypeScript + Tauri v2 code; Topic Router over windowing, IPC/permissions, state, performance, accessibility, cross-platform conventions
- `.claude/skills/testing-pro/SKILL.md` — write and improve tests across both layers (Vitest front-end + cargo-nextest Rust core)
- `.claude/skills/triage-bug/SKILL.md` — investigate a reported bug: gather, reproduce, root-cause, classify severity, decide disposition; produces triage report; writes no production code
- `.claude/skills/verify-cli-adapter/SKILL.md` — verify CLI adapter correctness after implementation
- `.claude/skills/work-with-bead/SKILL.md` — check, create, update, and maintain Beads work items for applicable non-trivial work
- `.claude/skills/work-with-git/SKILL.md` — select or create the appropriate task branch and enforce commit/push boundaries
- `.claude/skills/documentation-maintenance/SKILL.md` — post-change documentation updates
- `.claude/skills/task-complete/SKILL.md` — closure reporting for non-trivial routed work

### Pipelines
- `.claude/pipelines/implement-feature.md` — Tauri/React/Rust feature implementation
- `.claude/pipelines/implement-design-variant.md` — UI design variants, visual redesigns, desktop icon work, and visual validation
- `.claude/pipelines/design-system.md` — design-system token work (spacing, radius, color, icon, type) and `docs/design-book.md` maintenance
- `.claude/pipelines/implement-cli-adapter.md` — CLI adapter (Rust core) implementation
- `.claude/pipelines/triage-bug.md` — bug investigation, classification, and disposition routing
- `.claude/pipelines/fix-bug.md` — TDD-ordered bug fix for confirmed, root-caused defects

### Agents
- `.claude/agents/instruction-evaluator.md` — review instruction artifacts for quality and compliance
- `.claude/agents/artifact-acceptance-tester.md` — acceptance-test new or changed instruction artifacts
- `.claude/agents/code-reviewer.md` — review implementation diffs for correctness, TDD adherence, and project conventions
- `.claude/agents/test-runner.md` — execute and report validation commands/checks for non-trivial routed work
- `.claude/agents/design-reviewer.md` — review non-trivial UI design variants, visual changes, and desktop icon work

### Conventions
- `.claude/conventions/react-tauri/` — project-wide React + TypeScript + Tauri v2 conventions for windowing, IPC/permissions, state, performance, accessibility, and cross-platform behavior
- `.claude/conventions/react-tauri/desktop-platform-scope.md` — macOS/Windows-only platform scope, desktop icon outputs, and design-variant port hygiene

---

## Authoritative Sources

| Source | Purpose |
|---|---|
| `docs/idea.md` | Primary design specification — single source of truth for features, MVP scope, architecture intent |
| `.claude/docs/project_specification.md` | Project profile — role, duties, quality expectations, domain vocabulary |
| `README.md` | Developer guide — prerequisites, build/dev/test commands, source layout, cross-platform notes |
| `docs/design-book.md` | Design system reference — spacing, radius, color, icon, and type tokens defined in `src/styles.css` |
| `src-tauri/src/main.rs` | Tauri/Rust core entry point — calls `side_pilot_lib::run()` |
| `src-tauri/src/lib.rs` | Tauri core library — builder, command registration, module map (`commands`, `adapters`, `storage`) |
| `src/App.tsx` | React UI root — renders the floating `Bubble` |
