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
- The Beads and git gates have run when required by the manager.

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
For UI/interaction surfaces, state the **interaction contract** before writing component code and treat it as acceptance criteria — drag/click-vs-drag, keyboard (Enter/Shift+Enter/Esc/focus), sizing (default rows, max, scroll vs. pin, reflow on resize), empty/loading/error states, known WebKit quirks (see `AGENTS.md` → Quality Gates and `.claude/conventions/react-tauri/tauri-windowing.md`). The contract must name the **default/initial state the user reaches the feature from** and state success as a **user-visible outcome, not a mechanism** (per `AGENTS.md` → Quality Gates, "Interaction contract first"); write the acceptance test to assert that outcome **from the default state**, so a test set up in an already-open/seeded state can't pass while the feature is invisible in normal use.
For a **novel UI/interaction pattern** (no existing precedent in this app), check prior art before inventing one — a quick web/precedent search for the established pattern (e.g. where unread/in-progress indicators live relative to a collapsed surface) is cheaper than discovering the convention in review.
Before advancing, run the **change-hygiene self-check** — all four audits in `.claude/conventions/react-tauri/change-hygiene.md` (state-lifecycle completeness, refactor-invariant re-check, adversarial-input coverage, and the cumulative integration re-audit). Advisory here; enforced in Step 4 by `code-reviewer`.
Do not advance to Step 3 until this artifact is present and Build Status (tsc + cargo) is clean.

---

### Step 3 — Dedicated Validation

Agent: `.claude/agents/test-runner.md`

Required output: `Agent: test-runner - output below`

The agent runs locally whichever build/test/manual checks apply to the touched layers. If validation fails, return to Step 2.

For UI/interaction changes, validation must include **runtime evidence** from the real Tauri window (WKWebView) or the WebKit harness (not jsdom alone) — a screenshot/recording and any measured sizes/positions relevant to the change. The evidence must exercise the change **from the default/initial state a user reaches it through** (panels collapsed, nothing pre-opened/pre-seeded into a convenient state) and as a user would operate it, per `AGENTS.md` → Quality Gates ("Runtime UI validation"); evidence that only passes in a non-default state does not satisfy the gate. See that gate. Vitest passing does not satisfy this on its own. Until the WebKit harness exists (Phase 2), this evidence may be operator-supplied; the agent records and cites it.

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
