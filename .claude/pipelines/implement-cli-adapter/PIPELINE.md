---
name: implement-cli-adapter
description: Ordered execution path for implementing a CLI adapter (ClaudeAdapter, CodexAdapter, or GeminiAdapter) in side-pilot.
---

# Pipeline: implement-cli-adapter

## Purpose

Sequence the steps for implementing a CLI adapter: design resolution, implementation, adapter-specific verification, local validation, documentation maintenance, and closure.

Extends the `implement-feature` pattern with an additional adapter verification step (Step 3) that checks `Process` wiring, output parsing, and error/timeout handling before validation runs.

## Preconditions

Before this pipeline begins:
- The manager has classified the task as non-trivial and selected this pipeline.
- `Manager: manager - output below` artifact is present in the conversation.

## Steps

### Step 1 — Brainstorm (conditional)

**Trigger:** open design decisions exist for this adapter (command format, session handling, timeout value, output parsing strategy, or error representation).
**Skip:** adapter design is already fully resolved.

Skill: `.claude/skills/brainstorm/SKILL.md`
Required output: `Skill: brainstorm - output below` (decision summary confirmed by user)

Do not advance to Step 2 until the confirmed decision summary is present.

---

### Step 2 — Implement

Skill: `.claude/skills/implement-swift-feature/SKILL.md`

Scope for this step:
- The adapter Swift struct (e.g. `ClaudeAdapter`, `CodexAdapter`, `GeminiAdapter`)
- Command construction for the target CLI binary
- `Process` wiring: `executableURL`, `arguments`, `standardOutput`, `standardError`
- Async stdout and stderr reading
- Error handling (non-zero termination status)
- Timeout handling (terminate process if limit exceeded)
- Response parsing from raw stdout
- Unit tests for each of the above behaviors

Required output: `Skill: implement-swift-feature - output below`

Do not advance to Step 3 until this artifact is present and Compile Status is clean.

---

### Step 3 — Verify Adapter

Skill: `.claude/skills/verify-cli-adapter/SKILL.md`
Required output: `Skill: verify-cli-adapter - output below`

If any check is Fail, return to Step 2 before advancing.
Do not advance to Step 4 until all checks are Pass or Skipped-with-reason.

---

### Step 4 — Validate

Run locally:

```
xcodebuild -scheme side-pilot test
```

All tests must pass. If tests fail, return to Step 2.
Record the result (pass or fail + count) inline before advancing.

---

### Step 5 — Documentation Maintenance

Skill: `.claude/skills/documentation-maintenance/SKILL.md`
Required output: `Skill: documentation-maintenance - output below`

Do not advance to Step 6 until this artifact is present.

---

### Step 6 — Task Complete

Skill: `.claude/skills/task-complete/SKILL.md`
Required output: `Skill: task-complete - output below`
