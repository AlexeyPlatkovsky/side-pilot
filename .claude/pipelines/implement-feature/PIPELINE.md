---
name: implement-feature
description: Ordered execution path for implementing a SwiftUI/AppKit feature in side-pilot.
---

# Pipeline: implement-feature

## Purpose

Sequence the steps for implementing a non-trivial SwiftUI/AppKit feature: design resolution, implementation, local validation, documentation maintenance, and closure.

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

Skill: `.claude/skills/implement-swift-feature/SKILL.md`
Required output: `Skill: implement-swift-feature - output below`

Do not advance to Step 3 until this artifact is present and Compile Status is clean.

---

### Step 3 — Validate

Run locally:

```
xcodebuild -scheme side-pilot test
```

All tests must pass. If tests fail, return to Step 2.
Record the result (pass or fail + count) inline before advancing.

---

### Step 4 — Documentation Maintenance

Skill: `.claude/skills/documentation-maintenance/SKILL.md`
Required output: `Skill: documentation-maintenance - output below`

Do not advance to Step 5 until this artifact is present.

---

### Step 5 — Task Complete

Skill: `.claude/skills/task-complete/SKILL.md`
Required output: `Skill: task-complete - output below`
