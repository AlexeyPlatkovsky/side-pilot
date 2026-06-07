---
name: manager
description: Routes non-trivial work to the correct pipeline or capability; enforces Beads planning, git branch selection, output artifact gates, documentation maintenance, and task-complete.
---

# Manager: manager

## Purpose

Classify non-trivial tasks and route them to the correct execution path. Enforce the Beads planning gate when it applies, enforce git branch selection before edits begin, enforce output artifact gates at each routed handoff, append documentation maintenance when its trigger applies, and close with task-complete.

The manager routes. It does not execute steps.

## When This File Is Loaded

Load when `AGENTS.md` classification gate fires for non-trivial work.

If a task turns out to be trivial after review, say so and release it for direct execution.

## Classification

Before selecting any pipeline or capability, classify out loud:

| Dimension | Options |
|---|---|
| Complexity | trivial / non-trivial |
| Risk | low / medium / high / system-level |
| Domain | Tauri/React/Rust feature / UI design variant / CLI adapter / documentation / AI staff work / instruction system / bug triage / bug fix / other |

When unsure of complexity: treat as non-trivial.
When unsure of risk: treat as medium.

Classification must be stated before any file is created, edited, or deleted.

## Beads Planning Gate

For each non-trivial task, decide whether the Beads planning gate applies before selecting the execution route.

Exempt categories (Beads gate does not apply):
- documentation-only work
- AI staff work, including instruction artifacts, skills, pipelines, agents, manager routing, root contracts, and AI-tool governance
- bug triage
- bug fixes

**Important: exemption from the Beads gate does not exempt a task from the manager itself.** The manager is still loaded for all non-trivial work (per AGENTS.md §Task Classification). Beads-exempt tasks still receive a routing plan from the manager; the exemption only means the manager will not route through the Beads skill.

For all other non-trivial work, route `.claude/skills/work-with-bead/SKILL.md` before implementation. The skill must check for a relevant existing Beads item. If none exists, it must stop and ask the user whether to create the relevant epic, feature, or task before implementation continues.

**Note:** When the manager routes to `discover-feature`, the Beads planning gate is handled inside that pipeline (Step 4 runs `work-with-bead`). The manager does not separately route `work-with-bead` before that pipeline — doing so would be a duplicate gate.

The manager only decides whether the gate applies. The manager does not inspect or mutate Beads.

## Git Branch Gate

For every non-trivial task, route `.claude/skills/work-with-git/SKILL.md` after the Beads planning gate decision and before implementation or artifact changes begin.

The manager only routes the git branch gate. The skill decides whether to create a branch, stay on the current branch, or ask the user when branch ownership is ambiguous.

## Architecture Documentation Gate

For non-trivial product or engineering work that touches or depends on existing UI, IPC, Rust core, adapters, CLI process execution, links, storage, sessions, or messages, require focused architecture loading:
1. Read `docs/architecture/README.md` first as the routing index.
2. Read only the matching sub-file(s):
   - `docs/architecture/ui.md` for React components, UI data flow, and state
   - `docs/architecture/ipc.md` for Tauri commands, capabilities, permissions, and `ChatApi`
   - `docs/architecture/rust.md` for adapters, CLI process execution, app bootstrap, and link handling
   - `docs/architecture/db.md` for SQLite storage, schema, migrations, sessions, and messages
3. Do not bulk-load the full `docs/architecture/` directory unless the task explicitly spans every layer.

Skip this gate only for named low-value categories: narrow instruction-only changes, pure copy edits, documentation-only restructuring that does not change architecture facts, or isolated command execution.

When routing implementation, discovery, triage, or review work, include the architecture-doc decision in the visible manager output: required with focused file(s), or skipped with reason.

## Routing

| Task | Route |
|---|---|
| Discover, specify, scope, or refine requirements for a feature, epic, or task — including re-scoping an existing Beads item whose spec is bloated, incomplete, or poorly defined. Signal phrases: "discuss what X should do", "scope", "refine", "let's talk about requirements for". **Do not route here** if: a complete approved spec (scope-verifier returned No gaps, user gave explicit approval) already exists and no re-scoping is requested — route to `implement-feature` instead; or if the user is describing a defect, crash, or unexpected behavior — route to `triage-bug` instead. | `.claude/pipelines/discover-feature.md` |
| Implement a Tauri/React/Rust feature (floating window, hotkey, chat UI, storage, etc.) | `.claude/pipelines/implement-feature.md` |
| Implement a non-trivial UI design variant, visual redesign, theme, or matching desktop app icon | `.claude/pipelines/implement-design-variant.md` |
| Add, change, re-snap, or audit design tokens (spacing, radius, color, icon, type) and `docs/design-book.md` | `.claude/pipelines/design-system.md` |
| Apply a small visual/styling change through existing design tokens | `.claude/skills/design/SKILL.md` |
| Implement a CLI adapter (ClaudeAdapter, CodexAdapter, GeminiAdapter) | `.claude/pipelines/implement-cli-adapter.md` |
| Bug report or unexpected behavior (root cause unknown) | `.claude/pipelines/triage-bug.md` |
| Fix a confirmed bug (root cause known, reproduction steps available) | `.claude/pipelines/fix-bug.md` |
| Review, improve, or implement React/TypeScript/Tauri code against best practices | `.claude/skills/react-tauri-expert/SKILL.md` |
| Write or improve test code (Vitest front-end or Rust core) | `.claude/skills/testing-pro/SKILL.md` |
| Review test code or test changes | `.claude/agents/code-reviewer.md` |
| Validate non-trivial completed work with local build/test/manual checks | `.claude/agents/test-runner.md` |
| Review non-trivial UI design or icon work | `.claude/agents/design-reviewer.md` |
| Open design decision with meaningful trade-offs | `.claude/skills/brainstorm/SKILL.md` |
| Instruction system change (root contract, manager, pipelines, skills, agents, conventions) | Direct execution with gates from AGENTS.md §Instruction System Changes. Task-complete still required. |
| Create or update non-instruction reference documentation (e.g. `docs/architecture/README.md`, `.claude/docs/`) | Direct execution — no pipeline, Beads, or git branch required. Post-change documentation maintenance skill does not apply (the change *is* documentation). Task-complete still required. |
| Review an instruction artifact for quality and compliance | `.claude/agents/instruction-evaluator.md` |
| Acceptance-test a new or changed instruction artifact | `.claude/agents/artifact-acceptance-tester.md` |

If the task does not match any route:
- stop
- classify and describe the task out loud
- ask the user to clarify or choose the correct path

## Post-Change Enforcement

After the substantive implementation step and before task-complete:

1. Check whether documentation maintenance applies: did the change affect behavior, interfaces, commands, architecture, or domain facts?
2. If yes: load `.claude/skills/documentation-maintenance/SKILL.md` and require `Skill: documentation-maintenance - output below` before proceeding.
3. Load `.claude/skills/task-complete/SKILL.md` as the final step.
4. Before declaring task-complete, verify every required planned output artifact is present in the conversation. If any is missing, return to the missing step or report it as a blocker.

Apply AGENTS.md §Final Response Gate before sending the final response.

## Risk Escalation

| Risk | Requirement |
|---|---|
| Low / medium | Pipeline + local validation (`cargo nextest run` and/or `npm run test`) |
| High | Pipeline + instruction-evaluator review or manual code review before closing |
| System-level | Stop and require explicit user approval before any file changes |

## Output Contract

At routing time, emit:

`Manager: manager - output below`

Include:
- task classification (complexity, risk, domain)
- Beads planning gate requirement (required / skipped, and why)
- git branch gate requirement
- selected pipeline or capability
- validation requirement
- architecture documentation context requirement (required / skipped, focused file list or reason)
- documentation maintenance step (yes / no, and why)
- explicit final task-complete step
- expected output artifact label for each non-trivial routed handoff
