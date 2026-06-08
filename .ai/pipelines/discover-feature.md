---
name: discover-feature
description: Elicit, verify, and approve requirements for a new or partially-defined feature, epic, or task before implementation begins. Produces approved Beads items and BDD scenario files.
---

# Pipeline: discover-feature

## Purpose

Drive requirements discovery through a structured Q&A loop with the user, verify completeness with a dedicated subagent, obtain explicit user approval, and create the corresponding Beads items and BDD scenario files. This pipeline runs **before** `implement-feature` — it produces the approved spec that `implement-feature` consumes.

## Do Not Use This Pipeline For

- Confirmed bug fixes where the root cause is already known → use `fix-bug` pipeline
- Bug investigation where root cause is unknown → use `triage-bug` pipeline
- Work that already has a complete, user-approved spec with populated Beads acceptance criteria → route directly to `implement-feature`
- Pure design decisions with no behavioral change → use `brainstorm` skill
- Post-approval spec expansion on a previously approved item → restart with a new `discover-feature` run for the addendum, then set the existing item as parent or dependency in the new Beads item per `work-with-bead` conventions

Re-scoping a previously approved Beads item (spec is bloated, incomplete, or poorly defined) is a valid entry point for this pipeline. Step 4 delegates Beads item handling to `work-with-bead`; if the needed update path is unsupported, that skill must report the blocker instead of guessing.

## Preconditions

Before this pipeline begins:
- The manager has classified the task as non-trivial and selected this pipeline.
- `Manager: manager - output below` artifact is present in the conversation.

**If the `Manager: manager - output below` artifact is absent, stop immediately and return `Blocked` — do not begin Step 1.**

## Steps

---

### Step 1 — Q&A (discover-requirements skill)

Skill: `.ai/skills/discover-requirements/SKILL.md`

The skill performs its own context loading (Beads scan and docs check) at the start of the session before the first round of questions.

If this is a **loop re-entry** from Step 2: pass the gap list from the `scope-verifier` output as additional input context. The skill must address only the reported gaps — do not restart all six rounds.

Required output: `Skill: discover-requirements - output below` with a populated draft spec (all required fields present, including BDD scenarios).

Do not advance to Step 2 until this artifact is present and the draft spec includes all required fields.

---

### Step 2 — Scope verification (scope-verifier agent)

Agent: `.ai/agents/scope-verifier.md`

Pass the following as explicit structured input to the agent:
- The full `Skill: discover-requirements - output below` artifact from Step 1
- On loop re-entry: the prior `Agent: scope-verifier - output below` gap table as additional context

The agent is isolated-context; it cannot read the conversation scroll. Do not rely on context history — pass the artifacts explicitly.

Required output: `Agent: scope-verifier - output below`

**If verdict is `Gaps found`:** return to Step 1. Pass the gap table as input. Do not advance.

**If verdict is `No gaps`:** advance to Step 3.

**Loop exit condition:** If scope-verifier has returned `Gaps found` three consecutive times and the gaps remain unresolved, stop the loop. Present the remaining gaps to the user with:

> "These gaps could not be resolved through Q&A. Please provide answers to the items below, or confirm explicitly that they are out of scope before proceeding."

Wait for user input, then re-enter Step 2 once. If gaps still remain after that single additional pass, stop and report `Blocked`.

The scope-verifier must be spawned as a real subagent. Do not simulate its output inline.

---

### Step 3 — User approval

Present the final draft spec to the user in a readable summary. State explicitly:

> "The scope-verifier found no gaps. Do you approve this spec to proceed to Beads item creation?"

Wait for an explicit approval signal: "yes", "approved", "looks good", "go ahead", or equivalent direct confirmation. A non-committal response ("ok", "sure") does not count.

If the response is non-committal, re-ask once:

> "Please confirm with Yes or No: approve this spec and proceed?"

If the response remains non-committal after that single re-ask, stop and report `Blocked` — do not advance to Step 4.

Do not advance to Step 4 without explicit user approval.

---

### Step 4 — Beads items (work-with-bead skill)

Skill: `.ai/skills/work-with-bead/SKILL.md`

Use the approved draft spec as input. Follow all `work-with-bead` conventions for item type, parent linking, BDD `.feature` file paths, field population, and SP-NNN ID sequencing.

Required output: `Skill: work-with-bead - output below`

Do not advance to Step 5 until this artifact is present.

---

### Step 5 — Task complete

Skill: `.ai/skills/task-complete/SKILL.md`

Required output: `Skill: task-complete - output below`

Apply AGENTS.md §Final Response Gate before sending the final response. The `Skill: task-complete - output below` artifact must appear in the final response itself, not only in an intermediate message.
