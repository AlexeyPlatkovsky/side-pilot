---
name: triage-bug
description: Ordered execution path for investigating a reported bug in side-pilot — reproduce, root-cause, classify, and decide disposition before any fix begins.
---

# Pipeline: triage-bug

## Purpose

Route a raw bug report through investigation and produce a classified triage report that either feeds into `fix-bug` or closes with an explicit disposition. This pipeline does not write production code.

## Preconditions

Before this pipeline begins:
- The manager has classified the task as non-trivial and selected this pipeline.
- `Manager: manager - output below` is present in the conversation. If it is absent, stop and report: "Manager routing artifact is missing. Complete the AGENTS.md classification gate before entering this pipeline."
- A bug description is available (user report, failing test output, error log, or observed behavior). If none is present, stop and ask the user to provide one before proceeding.
- The description is a defect, not a feature request, design decision, or refactoring goal. If it describes desired new behavior, stop and report: "This task does not describe a defect. Use the manager to classify and route it to the correct capability."

## Steps

### Step 1 — Triage

Skill: `.ai/skills/triage-bug/SKILL.md`
Required output: `Skill: triage-bug - output below`

Do not advance to Step 2 until this artifact is present with all mandatory fields populated and a disposition chosen.

---

### Step 2 — Route

Read the `Disposition` field from the triage report:

| Disposition | Action |
|---|---|
| `fix-bug` | Report: "Triage complete. Route to `fix-bug` pipeline." Task-complete is deferred to `fix-bug` pipeline Step 6. |
| `needs-more-info` | Return the blocking question(s) to the user. Then load `.ai/skills/task-complete/SKILL.md`. Required output: `Skill: task-complete - output below` |
| `known-issue` | Record the existing reference. Then load `.ai/skills/task-complete/SKILL.md`. Required output: `Skill: task-complete - output below` |
| `wont-fix` | Record the rationale. Then load `.ai/skills/task-complete/SKILL.md`. Required output: `Skill: task-complete - output below` |
