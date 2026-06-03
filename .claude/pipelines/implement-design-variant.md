---
name: implement-design-variant
description: Ordered execution path for non-trivial side-pilot UI design variants, visual redesigns, and matching desktop app icon work.
---

# Pipeline: implement-design-variant

## Purpose

Sequence non-trivial UI design variant work for side-pilot: visual direction, implementation, desktop-only asset hygiene, dedicated validation, dedicated design/code review, documentation maintenance, and closure.

## Preconditions

- The manager has classified the task as non-trivial and selected this pipeline.
- `Manager: manager - output below` is present.
- The Beads and git gates have run when required by the manager.

## Steps

### Step 1 — Design Resolution

**Trigger:** the visual direction, target viewport/window, port assignment, icon concept, or platform scope is ambiguous.

Skill: `.claude/skills/brainstorm/SKILL.md`

Required output when triggered: `Skill: brainstorm - output below`

Skip only when the user has already provided enough concrete direction to implement.

---

### Step 2 — Implement

Skill: `.claude/skills/implement-tauri-feature/SKILL.md`

Required output: `Skill: implement-tauri-feature - output below`

The implementation must follow `.claude/conventions/react-tauri/desktop-platform-scope.md` in addition to the relevant React/Tauri conventions.

---

### Step 3 — Dedicated Validation

Agent: `.claude/agents/test-runner.md`

Required output: `Agent: test-runner - output below`

The agent must verify touched build/test commands and desktop-only asset hygiene. If validation fails, return to Step 2.

---

### Step 4 — Design Review

Agent: `.claude/agents/design-reviewer.md`

Required output: `Agent: design-reviewer - output below`

If verdict is `Needs revision` or `Blocked`, return to Step 2.

---

### Step 5 — Code Review

Agent: `.claude/agents/code-reviewer.md`

Required output: `Agent: code-reviewer - output below`

If verdict is `Needs revision` or `Blocked`, return to Step 2.

---

### Step 6 — Instruction Artifact Gates

**Trigger:** the design task also creates or materially changes any instruction artifact, routing rule, validation gate, or output contract.

Agents:
- `.claude/agents/instruction-evaluator.md`
- `.claude/agents/artifact-acceptance-tester.md`

Required outputs when triggered:
- `Agent: instruction-evaluator - output below`
- `Agent: artifact-acceptance-tester - output below`

---

### Step 7 — Documentation Maintenance

Skill: `.claude/skills/documentation-maintenance/SKILL.md`

Required output: `Skill: documentation-maintenance - output below`

---

### Step 8 — Task Complete

Skill: `.claude/skills/task-complete/SKILL.md`

Required output: `Skill: task-complete - output below`
