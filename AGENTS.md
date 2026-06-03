# AGENTS.md — side-pilot Root Contract

This file is the root operational contract for the side-pilot project.
All AI tools working on this project must read this file before starting any work.
This file overrides any tool-specific adapter on conflict.

---

## Project

Native macOS floating AI assistant. Routes user prompts to local CLI tools (Claude Code CLI, OpenAI Codex CLI, Gemini CLI) via Swift `Process`. Built with SwiftUI + AppKit.

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

## Quality Gates

These apply to all non-trivial work and may not be skipped:

- Unit tests required for all non-trivial logic (CLI adapters, routing layer, session model, local storage) before a feature is considered done.
- UI changes tested manually; state this explicitly.
- Documentation maintenance required after any change that affects behavior, interfaces, commands, architecture, or domain facts.
- Local validation (build + all tests pass) required before a feature closes.

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
- `.claude/skills/implement-swift-feature/SKILL.md` — implement a SwiftUI/AppKit feature with tests
- `.claude/skills/swiftui-expert/SKILL.md` — review, improve, and implement SwiftUI code with macOS best practices; Topic Router over 24 reference files + Instruments trace toolchain
- `.claude/skills/swift-testing-pro/SKILL.md` — write and review Swift Testing code; enforces unit test quality gate
- `.claude/skills/update-swiftui-apis/SKILL.md` — refresh swiftui-expert deprecated API references via Sosumi MCP (requires Sosumi)
- `.claude/skills/verify-cli-adapter/SKILL.md` — verify CLI adapter correctness after implementation
- `.claude/skills/documentation-maintenance/SKILL.md` — post-change documentation updates
- `.claude/skills/task-complete/SKILL.md` — closure reporting for non-trivial routed work

### Pipelines
- `.claude/pipelines/implement-feature/PIPELINE.md` — SwiftUI/AppKit feature implementation
- `.claude/pipelines/implement-cli-adapter/PIPELINE.md` — CLI adapter implementation

### Agents
- `.claude/agents/instruction-evaluator.md` — review instruction artifacts for quality and compliance
- `.claude/agents/artifact-acceptance-tester.md` — acceptance-test new or changed instruction artifacts

---

## Authoritative Sources

| Source | Purpose |
|---|---|
| `docs/idea.md` | Primary design specification — single source of truth for features, MVP scope, architecture intent |
| `.claude/docs/project_specification.md` | Project profile — role, duties, quality expectations, domain vocabulary |
| `side-pilot/side_pilotApp.swift` | App entry point |
| `side-pilot/ContentView.swift` | UI root |
