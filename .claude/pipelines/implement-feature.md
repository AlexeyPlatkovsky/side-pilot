---
name: implement-feature
description: Ordered execution path for implementing a Tauri + React + TypeScript feature in side-pilot.
---

# Pipeline: implement-feature

## Purpose

Sequence the steps for implementing a non-trivial Tauri/React/Rust feature: design resolution, implementation, local validation, documentation maintenance, and closure.

## Preconditions

Before this pipeline begins:
- The manager has classified the task as non-trivial and selected this pipeline.
- `Manager: manager - output below` artifact is present in the conversation.

## Steps

### Step 1 — Brainstorm (conditional)

**Trigger:** open design decisions exist for this feature.
**Skip:** design is already fully resolved.

Skill: `.claude/skills/brainstorm/SKILL.md`
Required output: `Skill: brainstorm - output below` (decision summary confirmed by user)

Do not advance to Step 2 until the confirmed decision summary is present.

---

### Step 2 — Implement

Skill: `.claude/skills/implement-tauri-feature/SKILL.md`
Required output: `Skill: implement-tauri-feature - output below`

Consult `react-tauri-expert` reference topics as needed; follow TDD order (Red → Green → Refactor) via `testing-pro`.
Do not advance to Step 3 until this artifact is present and Build Status (tsc + cargo) is clean.

---

### Step 3 — Dedicated Validation

Agent: `.claude/agents/test-runner.md`

Required output: `Agent: test-runner - output below`

The agent runs locally whichever build/test/manual checks apply to the touched layers. If validation fails, return to Step 2.

---

### Step 4 — Review

Agent: `.claude/agents/code-reviewer.md`
Required output: `Agent: code-reviewer - output below`

If verdict is `Needs revision`, return to Step 2 before advancing.
Do not advance to Step 5 until verdict is `Approved` or `Approved with minor notes`.

---

### Step 5 — Documentation Maintenance

Skill: `.claude/skills/documentation-maintenance/SKILL.md`
Required output: `Skill: documentation-maintenance - output below`

Do not advance to Step 6 until this artifact is present.

---

### Step 6 — Task Complete

Skill: `.claude/skills/task-complete/SKILL.md`
Required output: `Skill: task-complete - output below`
