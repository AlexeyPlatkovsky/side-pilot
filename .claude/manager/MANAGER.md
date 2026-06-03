---
name: manager
description: Routes non-trivial work to the correct pipeline or capability; enforces output artifact gates, documentation maintenance, and task-complete.
---

# Manager: manager

## Purpose

Classify non-trivial tasks and route them to the correct execution path. Enforce output artifact gates at each routed handoff, append documentation maintenance when its trigger applies, and close with task-complete.

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
| Domain | Tauri/React/Rust feature / CLI adapter / instruction system / other |

When unsure of complexity: treat as non-trivial.
When unsure of risk: treat as medium.

Classification must be stated before any file is created, edited, or deleted.

## Routing

| Task | Route |
|---|---|
| Implement a Tauri/React/Rust feature (floating window, hotkey, chat UI, storage, etc.) | `.claude/pipelines/implement-feature.md` |
| Implement a CLI adapter (ClaudeAdapter, CodexAdapter, GeminiAdapter) | `.claude/pipelines/implement-cli-adapter.md` |
| Review, improve, or implement React/TypeScript/Tauri code against best practices | `.claude/skills/react-tauri-expert/SKILL.md` |
| Write, review, or improve test code (Vitest front-end or Rust core) | `.claude/skills/testing-pro/SKILL.md` |
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
- selected pipeline or capability
- validation requirement
- documentation maintenance step (yes / no, and why)
- explicit final task-complete step
- expected output artifact label for each non-trivial routed handoff
