# AGENTS.md — side-pilot Root Contract

This file is the root operational contract for the side-pilot project.
All AI tools working on this project must read this file before starting any work.
This file overrides any tool-specific adapter on conflict.

---

## Project

Cross-platform desktop (macOS + Windows) floating AI assistant. Routes user prompts to local CLI tools (Claude Code CLI, OpenAI Codex CLI, Gemini CLI) via the Rust core (`std::process::Command` / `tauri-plugin-shell`). Built with **Tauri (Rust) + React + TypeScript**.

Primary design specification: `docs/idea.md`
Implemented architecture reference: `docs/architecture/README.md`
Project profile: `.claude/docs/project_specification.md`

---

## Task Classification

Before making any tool call that reads, writes, or modifies project files in response to a task request — classify the task out loud:

**Trivial** — single-step, low-risk, no behavioral change.
Proceed directly. State the classification.

**Non-trivial** — multi-step, or changes behavior, structure, commands, contracts, or domain facts:
1. Stop.
2. Load `.claude/skills/task-routing/SKILL.md`.
3. Do not implement until the manager emits its visible routing plan (`Manager: manager - output below`).

Non-trivial by default (no judgment required): any numbered list of issues to fix, any change touching more than one element, any UI or interaction change.

When unsure, treat as non-trivial.

Any user request to create, modify, or delete a file is an implicit "proceed" signal — classify it before acting, regardless of phrasing. A direct imperative ("modify ci.yml", "fix the test", "update the docs") carries the same obligation as "go ahead" or "implement it."

After a `Skill: task-complete` closure, every subsequent action request in the same session re-triggers the classification gate. A prior closure does not authorize skipping classification for the next request.

Requirements discovery, scoping, feature refinement, and re-scoping an existing Beads item are non-trivial tasks in their own right. Load the manager immediately for this work — do not wait for an implementation signal.

---

## Beads Planning Gate

For applicable non-trivial work, the manager routes through `.claude/skills/work-with-bead/SKILL.md` before implementation starts. The manager owns the exempt categories list.

When the Beads gate applies:
- check whether a relevant Beads item already exists
- if one exists, use it as the planning/work item
- if none exists, stop and ask the user whether to create the relevant epic, feature, or task before continuing
- never create a Beads item for trivial or exempt work

---

## Quality Gates

These apply to all non-trivial work at the level set by the assigned Quality Tier (see §Quality Tiers); none may be silently skipped:

- **TDD required** for non-trivial logic. Red → Green → Refactor.
- **Definition of Ready (DoR)** before Full-tier implementation begins — see §Definition of Ready.
- **Interaction contract must be established** before component code is written.
- **Runtime UI validation required** for any UI or interaction change. JSDOM-based testing alone does not satisfy this gate.
- **Documentation maintenance** after any change that affects behavior, interfaces, commands, architecture, or domain facts.
- **Local validation** before a feature closes: touched layers must build and tests must pass.
- **test-runner agent** for non-trivial routed validation. Direct command execution is allowed only for trivial requests.
- **design-reviewer agent** for non-trivial UI or icon work.

All quality practice standards are defined in the authoritative convention `.claude/conventions/testing-taxonomy.md`. For non-trivial routed work, quality practice validations must be executed through the **test-runner agent** — direct command execution is allowed only for trivial requests.

---

## Quality Tiers

Every non-trivial task is assigned a **Quality Tier** by the manager at routing time and recorded on the work item (the Beads item when one exists). The tier scales how much of the quality system applies — one calibrated standard, not parallel pipelines. When a task qualifies for more than one tier, the **higher tier wins**. If implementation reveals high-risk surface area, the implementing pipeline or reviewer escalates Lite → Full by returning to the manager to re-route through the Full path, including the DoR gate.

| Tier | Applies to | Enforced practices |
|---|---|---|
| **Full** | Features; refactors or changes touching high-risk surfaces (route planning, CLI argument construction, persistence/serialization, IPC contracts); any high or system-level risk work | All: DoR gate, progressive epic→feature→task elaboration, full `testing-taxonomy.md` §Test-Design Techniques case derivation, spec-to-test traceability, TDD (Red→Green→Refactor) |
| **Lite** | Confirmed bug fixes with known root cause; low-risk single-surface refactors; isolated low-risk changes | TDD with a regression test mapped to the defect/behavior; §Test-Design Techniques applied to the changed behavior only; reduced DoR ((reproduction or target identified) **and** DoD present, or each missing item carries an explicit user disposition); no decomposition or altitude elaboration |
| **Exempt** | Trivial work (per §Task Classification) | No added quality gates |

The tier is selected from two dimensions already in manager classification — **task domain** and **risk**: features and any high/system-level-risk work are **Full**; trivial work is **Exempt**; every other non-trivial task (e.g. medium- or low-risk bug fixes and single-surface refactors) is **Lite**. When the surface or risk is uncertain, treat as Full. The manager records the chosen tier and its justification in its routing output, and — for Lite — emits the reduced-readiness confirmation required by `.claude/skills/task-routing/SKILL.md` §Output Contract; that visible record is the enforcement point.

---

## Definition of Ready

Full-tier work must pass a Definition-of-Ready gate before implementation begins: the work item carries a detailed description, a linked and populated `.feature` file (relaxed for non-behavioral work), a Definition-of-Done checklist, parent context, named target surfaces, and stated constraints — or each missing artifact has an explicit user disposition (ignore / skip / create). The operational checklist and disposition handling are owned by the `verify-readiness` skill, run as Step 0 of `implement-feature`. Lite-tier work applies the reduced readiness noted in §Quality Tiers, confirmed by the manager at routing; Exempt work has no DoR gate.

This keeps single ownership: AGENTS.md states the DoR policy and which tier it binds; `verify-readiness` owns how to run it.

---

## Agent Execution Mode

Dedicated agents are first-class executors. They MUST be spawned as real subagents when a gate requires them. Inline substitution is prohibited. See `.claude/skills/task-routing/SKILL.md` for enforcement.

---

## Platform Asset Boundary

side-pilot targets **macOS and Windows only**. No iOS/Android assets. Desktop icons must keep the source asset plus macOS/Windows outputs only.

---

## Instruction System Changes

When creating or materially changing any instruction artifact:
- Use `instruction-evaluator` before accepting the artifact.
- Use `artifact-acceptance-tester` before accepting any skill, pipeline, agent, manager routing, validation gate, or output contract.

---

## Final Response Gate

For non-trivial routed work, the final response must include:

- `Skill: task-complete - output below`
- `Agent: test-runner - output below` when validation was required
- `Agent: instruction-evaluator - output below` and `Agent: artifact-acceptance-tester - output below` when instruction artifacts changed

Compact artifacts must preserve the label, status/verdict, and required table shape. Each `Agent:` artifact must originate from an actually spawned subagent.

---

## References

- Full capability registry: `.claude/docs/capabilities.md`
- Authoritative sources: `.claude/docs/project_specification.md` §Authoritative Local Sources
