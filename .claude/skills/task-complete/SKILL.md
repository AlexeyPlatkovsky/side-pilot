---
name: task-complete
description: Closure reporting for non-trivial routed work in side-pilot.
---

# Skill: task-complete

## When This Skill Applies

Use at the end of non-trivial routed work when:
- the task ran through a manager-routed execution path
- the framework requires an explicit closure record

Do not use for:
- trivial tasks
- isolated single-step low-risk work
- cosmetic changes

The manager appends this skill as the final step of non-trivial routed work. Execution skills and pipelines do not invoke it directly.

## Rules

### 1. Report Actual Execution

Report what happened, not an idealized plan. Make skipped or changed steps visible.

### 2. Required Format

The output must be a markdown table with exactly these three columns — do not rename or add columns:

| Step | Skill / Agent | Comment |
|------|---------------|---------|

### 3. Every Executed Step Must Appear

Every executed step is a row. If a planned step was skipped, include it and explain why in `Comment`.

### 4. Reference Output Artifacts

For planned routed handoffs, `Comment` must reference the step's visible output artifact label (e.g. `Skill: implement-swift-feature - output below`).

### 5. Refuse Incomplete Closure

If a required planned output artifact is missing from the conversation, do not declare completion. Report closure as blocked and name the missing artifact so the manager can return to the missing step.

## Output Contract

Begin with:

`Skill: task-complete - output below`

Then provide the closure table.
