---
name: discover-requirements
description: Structured Q&A to elicit complete, unambiguous requirements for a feature, epic, or task before implementation begins. Never guesses at unclear points — always asks.
---

# Skill: discover-requirements

## Purpose

Drive a structured, iterative conversation with the user to surface every requirement, edge case, failure state, and constraint for a piece of work before any spec is written. Produce a draft spec that can feed directly into `work-with-bead` without gaps.

## When This Skill Applies

Use when:
- A new feature, epic, or task needs scoping and the requirements are not yet complete
- A partial description exists and gaps must be filled before implementation
- The `discover-feature` pipeline reaches Step 2 (initial Q&A) or loops back from Step 3 (gap-targeted Q&A)

Do not use:
- After a spec has been approved by the user
- For bug triage or bug fixes (use `triage-bug` pipeline instead)
- For pure design decisions with no behavioral change (use `brainstorm` instead)

## Context Loading

Before asking any questions:

1. Run `bd list --json` to find related Beads items. If the work extends an existing item, load its full detail with `bd show <id>`.
2. Read any existing `.feature` files under `docs/` relevant to the topic.
3. If the requested work touches or depends on existing UI, IPC, Rust core, or database behavior, read `docs/architecture/README.md` and then only the focused architecture sub-file(s) named by its routing table.
4. State what was found: "Found related item SP-NNN: <title>" or "No related items found." Also state which architecture docs were checked, or "Architecture docs skipped: <reason>."

This context informs the Q&A — do not re-ask what is already explicit in an existing item.

## Q&A Rounds

Ask questions in rounds. Complete each round fully before starting the next. Do not bundle all rounds into one message.

If this is a **gap-targeted re-entry** (called from Step 3 after scope-verifier found gaps): skip to the specific rounds that address the reported gaps. Do not restart from Round 1.

### Round 1 — Goal & User

- What user problem or need does this address?
- Who is the user / what role or context triggers this?
- What does success look like from the user's perspective? (user-visible outcome, not mechanism)

### Round 2 — Happy Path

- What is the step-by-step flow for the normal case?
- What triggers it (user action, event, CLI output, timer)?
- What is the expected output or visible result?

### Round 3 — Failure & Error States

- What can go wrong at each step?
- How should each failure behave? (silent, visible error, fallback, retry)
- What happens when the underlying CLI / service is unavailable?

### Round 4 — Edge Cases & Boundaries

- What is the empty/zero state? (no items, no data, first launch)
- What are boundary inputs? (very long text, special characters, maximum count)
- Does concurrent access matter? (two prompts in flight, rapid re-trigger)
- Any platform-specific behavior differences between macOS and Windows?

### Round 5 — Constraints

- Performance or latency expectations? (or explicit "none")
- Security or permission requirements? (or explicit "none")
- If a UI surface: what is the interaction contract? (drag, keyboard, sizing, default state the user starts from)

### Round 6 — Scope & Integration

- What is explicitly OUT of scope for this work?
- Does this extend an existing epic, feature, or task? *(cross-check against the Beads items loaded in Context Loading before presenting this question to the user)*
- What existing Beads items are related or must remain unchanged?

## Rules

### Never Guess

If any answer introduces new ambiguity or an important question is unanswered, ask a follow-up in the same round before proceeding. Never proceed with "I'll assume X" — always ask.

### One Round at a Time

Present one round's questions, then stop and wait for the user's answers before presenting the next round.

### "None" Verification for Rounds 3 and 4

If the user provides only "none" or "not applicable" for all sub-questions in Round 3 (failures) or Round 4 (edge cases), do not accept that silently. Ask one verification follow-up before advancing:

> "Can you confirm there are genuinely no failure / edge-case scenarios for this feature? If so, please state that explicitly and I will note it as verified."

A confirmed explicit statement counts as answered. Silence or a vague "yeah" does not.

### Completeness Gate

Do not emit the draft spec until ALL six rounds have explicit answers. An answer counts as explicit only if it directly addresses the sub-question. A single word, a restated question title, or a vague qualifier ("it should work", "normal cases") does not qualify — re-ask that sub-question before advancing. An answer of "not applicable" or "none" is valid when it was explicitly confirmed (see "None Verification" above for Rounds 3 and 4).

## Draft Spec Format

When all rounds are complete, emit the draft spec using this structure exactly:

```
Type: [epic | feature | task]
Parent: [SP-NNN — <title>, or "standalone"]
Title: <concise imperative phrase>

Description:
<narrative written so an AI agent with no conversation context can identify: the user goal, the happy path, the primary failure mode, and the scope boundary; must address all four points explicitly>

Non-goals:
- <explicit out-of-scope item>

Acceptance criteria (DoD):
- [ ] <objectively verifiable condition>
- [ ] <objectively verifiable condition>

Constraints / design notes:
<performance, security, UI contract, platform notes — or "none">

Proposed BDD scenarios:
  Scenario: <Happy path — one-line title>
    Given ...
    When ...
    Then ...

  Scenario: <Error state — one-line title>
    Given ...
    When ...
    Then ...

  Scenario: <Edge case — one-line title> (add as many as surfaced)
    Given ...
    When ...
    Then ...

Labels: [frontend | rust | tauri | docs | cli-adapter] (pick all that apply)
Dependencies: [SP-NNN, or "none"]
```

## Output Contract

When the draft spec is ready, begin the response with:

`Skill: discover-requirements - output below`

Then emit the draft spec in the format above.

Do not emit this artifact until all six rounds are complete and the draft spec is fully populated.
