---
name: verify-readiness
description: Definition-of-Ready gate — verify a routed work item carries every artifact an AI agent needs to implement it correctly in one run, and STOP for an explicit user disposition (ignore / skip / create) on any gap before implementation begins.
---

# Skill: verify-readiness

## Purpose

Confirm that a routed work item is **Ready** for implementation: it carries every artifact an AI agent with no conversation context needs to build it correctly in a single run. A missing or vague readiness artifact is the root cause of post-hoc rework, so this gate **blocks and asks** rather than guessing.

This skill verifies that readiness artifacts **exist and are specific**. It does not author them and it does not re-approve scope — authoring is owned by `work-with-bead` and `discover-feature`; scope approval is owned by `discover-feature`.

## When This Skill Applies

Use when a pipeline routes a Definition-of-Ready check before implementation begins — currently Step 0 of `.claude/pipelines/implement-feature.md`.

Do not use:
- For trivial or exempt work that never entered a pipeline.
- To re-litigate already-approved scope. A spec approved through `discover-feature` that still carries all readiness artifacts passes here without re-discovery.

## Procedure

1. Load the work item and, for a child task, its parent feature/epic. Read the linked `.feature` file at the item's `--spec-id` path. A missing or dangling `--spec-id` (unset, or pointing at a non-existent file) is itself a criterion-2 failure (artifact-authoring gap), not a reason to halt.
2. Evaluate every DoR criterion below. A criterion passes only if the artifact is **present and specific** — a restated title, a placeholder, or "TBD" does not pass.
3. **If all criteria pass:** emit the output artifact with status `completed` / `Ready` and report. The routing pipeline advances.
4. **If any criterion fails: do not implement.** For each gap, ask the user which disposition applies (see Dispositions), collect the answer, then emit the output artifact with status `blocked` listing each gap and its chosen disposition. This skill's output artifact is the auditable record of accepted gaps — do not write Beads fields from here. Persisting an accepted disposition onto the work item is owned by `.claude/skills/work-with-bead/SKILL.md`; route it there when the item is next updated.
5. The routing pipeline resolves each gap per its disposition and re-runs this gate. Do not report `Ready` until all criteria pass or every gap carries an explicit user disposition.

## DoR Criteria

The item is Ready only when all of the following pass:

1. **Detailed description** — a narrative an agent with no conversation context can act on: user goal, happy path, primary failure mode, and scope boundary, all explicit.
2. **Linked, populated `.feature` file** — Gherkin scenarios covering the happy path, at least one error/failure state, and the edge cases surfaced during discovery; the item's `--spec-id` points at that file. *Relaxed only for non-behavioral work* (pure refactor, perf tuning, DB migration) per `.claude/skills/work-with-bead/SKILL.md` §BDD Scenario Files — such items must instead carry a design/constraints note describing the invariant being preserved.
3. **DoD checklist** — `--acceptance` populated with bullets that are each objectively pass/fail.
4. **Parent context** — for a child task, the parent feature/epic exists and is readable; for a standalone task, that is stated explicitly.
5. **Named target surfaces** — target files, modules, commands, or interfaces named when known, or an explicit "to be identified during implementation" so the omission is deliberate, not accidental.
6. **Constraints** — performance, security, platform (macOS/Windows), and — for UI surfaces — the interaction contract are stated, or an explicit "none."

## Dispositions

When a criterion fails, ask the user which disposition applies to that gap. The three differ by their effect on deliverable scope:

- **ignore** — the gap does **not** change deliverable scope; proceed without the artifact and record it as a knowingly accepted gap on the item.
- **skip** — the gap **removes a portion** of deliverable scope; defer that portion and narrow this task accordingly, noting the descoped part on the item.
- **create** — produce the missing artifact before resuming. Route by gap type:
  - **Requirements/scope gap** (unknown behavior, undiscovered edge cases, missing or thin scenarios that reflect undiscovered requirements): do **not** nest `discover-feature` from inside this skill. Report `blocked` and return control to the manager to re-route `discover-feature`; this gate re-runs after the spec is approved.
  - **Artifact-authoring gap** (requirements are known but the `.feature` file, `--acceptance` DoD, `--spec-id` link, or Beads detail is unwritten): route `.claude/skills/work-with-bead/SKILL.md` to author it, then re-run this gate.

Never proceed past a gap with "I'll assume X." A gap is resolved only by an explicit user disposition.

## Output Contract

Begin the artifact with:

`Skill: verify-readiness - output below`

Then report status (`completed` when Ready, `blocked` when any gap awaits or carries a disposition) and a per-criterion table:

| Criterion | Result | Gap / Disposition |
|-----------|--------|-------------------|
| 1. Detailed description | pass / blocked | — or `<gap>` → ignore / skip / create |
| 2. Linked `.feature` | pass / blocked / relaxed | … |
| 3. DoD checklist | pass / blocked | … |
| 4. Parent context | pass / blocked | … |
| 5. Named target surfaces | pass / blocked | … |
| 6. Constraints | pass / blocked | … |

End with the gate verdict line: `DoR gate: Ready` or `DoR gate: Blocked — <n> gap(s) awaiting/with disposition`.

The routing pipeline branches on this `DoR gate:` verdict line: `status: completed` corresponds to `Ready`, and `status: blocked` to `Blocked`.
