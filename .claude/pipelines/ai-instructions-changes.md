---
name: ai-instructions-changes
description: Ordered execution path for AI instruction artifact changes (AGENTS.md, skills, pipelines, agents, conventions) in side-pilot.
---

# Pipeline: ai-instructions-changes

## Purpose

Sequence the steps for materially changing instruction artifacts: implement the change, validate via acceptance tests, evaluate for quality and layer fit, and close.

## Preconditions

Before this pipeline begins:
- The manager has classified the task as non-trivial and selected this pipeline.
- `Manager: manager - output below` artifact is present in the conversation.
- Beads planning gate: always skipped for instruction system changes (exempt category).
- Git branch gate: applies per manager decision. Instruction-only changes typically skip it.

If any precondition is missing, report as blocked. Do not proceed with pipeline execution until the missing precondition is resolved.

## Steps

### Step 1 — Implement

Plan, edit, and self-check the instruction artifact change.

Skill: `.claude/skills/ai-instructions/SKILL.md`
Required output: `Skill: ai-instructions - output below`

Do not advance to Step 2 until this artifact is present with `Status` = `completed`.

If the self-check fails, fix and re-run before advancing.

---

### Step 2 — Acceptance Test

Run 9 scenario tests per changed artifact to verify correctness.

Agent: `.claude/agents/artifact-acceptance-tester.md`
Required output: `Agent: artifact-acceptance-tester - output below`

If verdict is `Needs revision` or `Blocked`, return to Step 1.
Do not advance to Step 3 until verdict is `Accept`.

---

### Step 3 — Evaluation

Review the changed artifacts for quality, layer fit, authority, and integration safety.

Agent: `.claude/agents/instruction-evaluator.md`
Required output: `Agent: instruction-evaluator - output below`

If verdict is `Needs revision`, `Reject`, or `split required`, return to Step 1 before advancing.
If verdict is `Accept with minor edits`, apply the suggested fixes and re-run Step 3 (evaluation) before advancing to Step 4.
Do not advance to Step 4 until verdict is `Accept`.

---

### Step 4 — Task Complete

Skill: `.claude/skills/task-complete/SKILL.md`
Required output: `Skill: task-complete - output below`

Documentation maintenance step is skipped — instruction artifact changes ARE documentation, not product changes that need separate documentation updates.
