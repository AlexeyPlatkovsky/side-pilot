---
name: design-system
description: Ordered execution path for side-pilot design-system work — design tokens, the centralized token set in styles.css, and the design-book.md reference.
---

# Pipeline: design-system

## Purpose

Sequence non-trivial design-system work: adding, changing, re-snapping, or
auditing design tokens (spacing, radius, color, icon size, type) in
`src/styles.css` `:root`, keeping `docs/design-book.md` in sync, and validating the
global visual impact.

Use this pipeline for token/system maintenance. For a one-off visual redesign,
theme, or matching app icon, use `implement-design-variant.md` instead. Both
pipelines may reference the `design` skill as a normal step when a redesign also
reshapes the token system; routing stays owned by the manager.

## Preconditions

- The manager has classified the task as non-trivial and selected this pipeline.
- `Manager: manager - output below` is present.
- The git gate has run; the Beads planning gate applies or is skipped as decided by
  the manager (owned by `MANAGER.md` / `AGENTS.md`).

## Steps

### Step 1 — Apply / Maintain Tokens

Skill: `.ai/skills/design/SKILL.md`

Required output: `Skill: design - output below`

Token changes in `src/styles.css` `:root` and the matching tables in
`docs/design-book.md` must land together. Each touched scale stays ≤ 4 steps or
records a justified exception.

---

### Step 2 — Dedicated Validation

Agent: `.ai/agents/test-runner.md`

Required output: `Agent: test-runner - output below`

The agent must confirm `npm run build` and `npm run test` pass (token changes are
global) and report the visual-validation method. If validation fails, return to
Step 1.

---

### Step 3 — Design Review

Agent: `.ai/agents/design-reviewer.md`

Required output: `Agent: design-reviewer - output below`

The agent must check token adherence (no new hardcoded values) and
styles.css ↔ design-book.md sync. If verdict is `Needs revision` or `Blocked`,
return to Step 1.

---

### Step 4 — Code Review

Agent: `.ai/agents/code-reviewer.md`

Required output: `Agent: code-reviewer - output below`

If verdict is `Needs revision` or `Blocked`, return to Step 1.

---

### Step 5 — Instruction Artifact Gates

**Trigger:** the work also creates or materially changes any instruction artifact,
routing rule, validation gate, or output contract (e.g. the `design` skill, this
pipeline, or the `design-reviewer` agent).

Agents:
- `.ai/agents/instruction-evaluator.md`
- `.ai/agents/artifact-acceptance-tester.md`

Required outputs when triggered:
- `Agent: instruction-evaluator - output below`
- `Agent: artifact-acceptance-tester - output below`

---

### Step 6 — Documentation Maintenance

Skill: `.ai/skills/documentation-maintenance/SKILL.md`

Required output: `Skill: documentation-maintenance - output below`

---

### Step 7 — Task Complete

Skill: `.ai/skills/task-complete/SKILL.md`

Required output: `Skill: task-complete - output below`
