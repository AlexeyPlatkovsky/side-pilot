---
name: fix-bug
description: Ordered execution path for fixing a confirmed bug in side-pilot — write a failing test, fix, validate, review, document, and close.
---

# Pipeline: fix-bug

## Purpose

Sequence the steps for fixing a confirmed, root-caused bug: write a failing test that proves the bug (Red), implement the minimal fix (Green), validate, review, and close. Enforces TDD order — no production code before a failing test.

## Preconditions

Before this pipeline begins, all of the following must be present in the conversation:
- The manager has classified the task as non-trivial and selected this pipeline.
- `Manager: manager - output below` is present. If it is absent, stop and report: "Manager routing artifact is missing. Complete the AGENTS.md classification gate before entering this pipeline."
- A triage report (`Skill: triage-bug - output below`) OR the user has explicitly provided:
  - reproduction steps
  - root cause location (file + line range)
  - severity and affected layer(s)

If any precondition is missing, stop and report which item is absent. Do not proceed to Step 1.

## Steps

### Step 1 — Red: Write Failing Test

Before touching any production file, write a test that:
- fails against the current (buggy) codebase
- directly exercises the root-cause location identified in triage
- asserts the **correct** (expected) behavior, not the current broken behavior

Skill: `.claude/skills/testing-pro/SKILL.md`

Layer guidance:
- Front-end bug: Vitest + React Testing Library (`references/frontend.md`)
- Rust core bug: cargo-nextest, `#[tokio::test]`, mockall (`references/rust.md`)
- Both layers: write tests for each; treat them independently

If `testing-pro` emits status `blocked` (e.g., the bug can only be reproduced by spawning a real subprocess), stop and surface the blocker to the user. Do not advance without explicit user approval and a documented reason for the manual Red verification.

Required output: `Skill: testing-pro - output below` with status `completed` and at least one new test confirmed Red.

Do not advance to Step 2 until this artifact is present.

---

### Step 2 — Green: Fix

Implement the minimal code change that makes the failing test(s) pass without breaking existing tests.

Skill: `.claude/skills/implement-tauri-feature/SKILL.md`

Scope: implement the minimal code change that makes the failing test(s) pass without breaking existing tests. If the fix touches subprocess wiring or a CLI adapter, Step 3a applies.

Required output: `Skill: implement-tauri-feature - output below`

Do not advance to Step 3 until Build Status (tsc + cargo) is clean and the new test(s) pass. If the build is not clean, fix the build error and re-run before emitting the artifact.

---

### Step 3 — Dedicated Validation

Agent: `.claude/agents/test-runner.md`
Required output: `Agent: test-runner - output below`

The agent runs the full test suite for every touched layer (`npm run test` and `npm run test:e2e` front-end, `cargo nextest run` Rust core). All tests — new and pre-existing — must pass. If validation fails, return to Step 2.
Do not advance to Step 3a/Step 4 until this artifact is present with a passing result.

---

### Step 3a — Verify Adapter (conditional)

**Trigger:** the fix touches subprocess wiring, command construction, output parsing, or any CLI adapter (`ClaudeAdapter`, `CodexAdapter`, `GeminiAdapter`).
**Skip:** fix is in front-end or non-adapter Rust code.

Skill: `.claude/skills/verify-cli-adapter/SKILL.md`
Required output: `Skill: verify-cli-adapter - output below`

If any check is Fail, return to Step 2 before advancing.

---

### Step 4 — Review

Agent: `.claude/agents/code-reviewer.md`
Required output: `Agent: code-reviewer - output below`

The reviewer must confirm:
- the failing test existed before the fix (TDD compliance)
- the fix is minimal and does not introduce new behavior beyond the bug scope
- no Blocking or Major findings remain

If verdict is `Needs revision`, return to Step 2 before advancing.
Do not advance to Step 5 until verdict is `Approved` or `Approved with minor notes`.

---

### Step 5 — Documentation Maintenance (conditional)

**Trigger:** the fix changes observable behavior, a public interface, a command signature, an architecture constraint, or a domain fact documented in `AGENTS.md`, `docs/idea.md`, `docs/architecture/`, or `.claude/docs/`.
**Skip:** fix is internal-only with no externally visible behavioral change.

Skill: `.claude/skills/documentation-maintenance/SKILL.md`
Required output: `Skill: documentation-maintenance - output below`

Do not advance to Step 6 until this artifact is present (if triggered).

---

### Step 6 — Task Complete

Skill: `.claude/skills/task-complete/SKILL.md`
Required output: `Skill: task-complete - output below`
