---
name: implement-cli-adapter
description: Ordered execution path for implementing a CLI adapter (ClaudeAdapter, CodexAdapter, or GeminiAdapter) in the Rust/Tauri core of side-pilot.
---

# Pipeline: implement-cli-adapter

## Purpose

Sequence the steps for implementing a CLI adapter: design resolution, implementation, adapter-specific verification, local validation, documentation maintenance, and closure.

Extends the `implement-feature` pattern with an additional adapter verification step (Step 3) that checks subprocess wiring, structured-output parsing, and error/timeout/cancellation handling before validation runs.

## Preconditions

Before this pipeline begins:
- The manager has classified the task as non-trivial and selected this pipeline.
- `Manager: manager - output below` artifact is present in the conversation.
- The Beads and git gates have run when required by the manager.

## Steps

### Step 1 — Brainstorm (conditional)

**Trigger:** open design decisions exist for this adapter (command format, session handling, timeout value, output parsing strategy, or error representation).
**Skip:** adapter design is already fully resolved (see the CLI Invocation Contract in `docs/idea.md`).

Skill: `.claude/skills/brainstorm/SKILL.md`
Required output: `Skill: brainstorm - output below` (decision summary confirmed by user)

Do not advance to Step 2 until the confirmed decision summary is present.

---

### Step 2 — Implement

Skill: `.claude/skills/implement-tauri-feature/SKILL.md`

Scope for this step (Rust core): implement the adapter type (e.g. `CodexAdapter`) against the shared `CliAdapter` trait per the **CLI Invocation Contract** (`docs/idea.md` §1–§9). Follow TDD order (Red → Green → Refactor) via `testing-pro` (`references/rust.md`), with subprocess effects behind a `mockall`-mocked trait. The specific behaviors to cover are enumerated by `verify-cli-adapter`'s checks (Step 3) — this pipeline does not restate them.

Required output: `Skill: implement-tauri-feature - output below`

Do not advance to Step 3 until this artifact is present and Build Status (cargo) is clean.

---

### Step 3 — Verify Adapter

Skill: `.claude/skills/verify-cli-adapter/SKILL.md`
Required output: `Skill: verify-cli-adapter - output below`

If any check is Fail, return to Step 2 before advancing.
Do not advance to Step 4 until all checks are Pass or Skipped-with-reason.

---

### Step 4 — Dedicated Validation

Agent: `.claude/agents/test-runner.md`
Required output: `Agent: test-runner - output below`

The agent runs the Rust core test suite for the touched adapter. All tests must pass. If validation fails, return to Step 2.
Do not advance to Step 5 until this artifact is present with a passing result.

---

### Step 5 — Review

Agent: `.claude/agents/code-reviewer.md`
Required output: `Agent: code-reviewer - output below`

If verdict is `Needs revision`, return to Step 2 before advancing.
Do not advance to Step 6 until verdict is `Approved` or `Approved with minor notes`.

---

### Step 6 — Documentation Maintenance

Skill: `.claude/skills/documentation-maintenance/SKILL.md`
Required output: `Skill: documentation-maintenance - output below`

Do not advance to Step 7 until this artifact is present.

---

### Step 7 — Task Complete

Skill: `.claude/skills/task-complete/SKILL.md`
Required output: `Skill: task-complete - output below`
