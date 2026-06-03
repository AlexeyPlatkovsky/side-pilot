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

The gate is skipped for:
- documentation-only work
- AI staff work, including instruction artifacts, skills, pipelines, agents, manager routing, root contracts, and AI-tool governance
- bug triage
- bug fixes

For all other non-trivial work, route `.claude/skills/work-with-bead/SKILL.md` before implementation. The skill must check for a relevant existing Beads item. If none exists, it must stop and ask the user whether to create the relevant epic, feature, or task before implementation continues.

The manager only decides whether the gate applies. The manager does not inspect or mutate Beads.

## Git Branch Gate

For every non-trivial task, route `.claude/skills/work-with-git/SKILL.md` after the Beads planning gate decision and before implementation or artifact changes begin.

The manager only routes the git branch gate. The skill decides whether to create a branch, stay on the current branch, or ask the user when branch ownership is ambiguous.

## Routing

| Task | Route |
|---|---|
| Implement a Tauri/React/Rust feature (floating window, hotkey, chat UI, storage, etc.) | `.claude/pipelines/implement-feature.md` |
| Implement a non-trivial UI design variant, visual redesign, theme, or matching desktop app icon | `.claude/pipelines/implement-design-variant.md` |
| Implement a CLI adapter (ClaudeAdapter, CodexAdapter, GeminiAdapter) | `.claude/pipelines/implement-cli-adapter.md` |
| Bug report or unexpected behavior (root cause unknown) | `.claude/pipelines/triage-bug.md` |
| Fix a confirmed bug (root cause known, reproduction steps available) | `.claude/pipelines/fix-bug.md` |
| Review, improve, or implement React/TypeScript/Tauri code against best practices | `.claude/skills/react-tauri-expert/SKILL.md` |
| Write or improve test code (Vitest front-end or Rust core) | `.claude/skills/testing-pro/SKILL.md` |
| Review test code or test changes | `.claude/agents/code-reviewer.md` |
| Validate non-trivial completed work with local build/test/manual checks | `.claude/agents/test-runner.md` |
| Review non-trivial UI design or icon work | `.claude/agents/design-reviewer.md` |
| Open design decision with meaningful trade-offs | `.claude/skills/brainstorm/SKILL.md` |
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

Before sending the final response:

1. Verify that every required routed final artifact appears in the final response draft, not only in earlier commentary.
2. Always include `Skill: task-complete - output below` for non-trivial routed work.
3. Include `Agent: test-runner - output below` when validation was required.
4. Include `Agent: instruction-evaluator - output below` and `Agent: artifact-acceptance-tester - output below` when instruction artifacts, routing, validation gates, or output contracts changed.
5. If a required artifact is missing from the final response draft, revise the final response before sending.

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
- documentation maintenance step (yes / no, and why)
- explicit final task-complete step
- expected output artifact label for each non-trivial routed handoff
