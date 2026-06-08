# Capability Registry — side-pilot

## Manager

- `.ai/manager/MANAGER.md` — classifies and routes non-trivial work; enforces documentation maintenance and task-complete

## Skills

- `.ai/skills/discover-requirements/SKILL.md` — structured Q&A to elicit complete, unambiguous requirements for a feature, epic, or task; never guesses; outputs a draft spec ready for scope-verifier and work-with-bead
- `.ai/skills/brainstorm/SKILL.md` — open design decisions with meaningful trade-offs
- `.ai/skills/design/SKILL.md` — apply and maintain the design system (CSS tokens) and keep `docs/design-book.md` in sync
- `.ai/skills/implement-tauri-feature/SKILL.md` — implement a Tauri/React/Rust feature with tests
- `.ai/skills/react-tauri-expert/SKILL.md` — review, improve, and implement React + TypeScript + Tauri v2 code; Topic Router over windowing, IPC/permissions, state, performance, accessibility, cross-platform conventions
- `.ai/skills/testing-pro/SKILL.md` — write and improve tests across both layers (Vitest front-end + cargo-nextest Rust core)
- `.ai/skills/triage-bug/SKILL.md` — investigate a reported bug: gather, reproduce, root-cause, classify severity, decide disposition; produces triage report; writes no production code
- `.ai/skills/verify-cli-adapter/SKILL.md` — verify CLI adapter correctness after implementation
- `.ai/skills/work-with-bead/SKILL.md` — check, create, update, and maintain Beads work items for applicable non-trivial work
- `.ai/skills/work-with-git/SKILL.md` — select or create the appropriate task branch and enforce commit/push boundaries
- `.ai/skills/documentation-maintenance/SKILL.md` — post-change documentation updates
- `.ai/skills/task-complete/SKILL.md` — closure reporting for non-trivial routed work

## Pipelines

- `.ai/pipelines/discover-feature.md` — requirements discovery, scope verification, user approval, and Beads item creation before implementation
- `.ai/pipelines/implement-feature.md` — Tauri/React/Rust feature implementation
- `.ai/pipelines/implement-design-variant.md` — UI design variants, visual redesigns, desktop icon work, and visual validation
- `.ai/pipelines/design-system.md` — design-system token work (spacing, radius, color, icon, type) and `docs/design-book.md` maintenance
- `.ai/pipelines/implement-cli-adapter.md` — CLI adapter (Rust core) implementation
- `.ai/pipelines/triage-bug.md` — bug investigation, classification, and disposition routing
- `.ai/pipelines/fix-bug.md` — TDD-ordered bug fix for confirmed, root-caused defects

## Agents

- `.ai/agents/scope-verifier.md` — checks a draft requirements spec for structural completeness; returns "No gaps" or a numbered gap list with targeted questions; does not write code
- `.ai/agents/instruction-evaluator.md` — review instruction artifacts for quality and compliance
- `.ai/agents/artifact-acceptance-tester.md` — acceptance-test new or changed instruction artifacts
- `.ai/agents/code-reviewer.md` — review implementation diffs for correctness, TDD adherence, and project conventions
- `.ai/agents/test-runner.md` — execute and report validation commands/checks for non-trivial routed work
- `.ai/agents/design-reviewer.md` — review non-trivial UI design variants, visual changes, and desktop icon work

## Conventions

- `.ai/conventions/react-tauri/` — project-wide React + TypeScript + Tauri v2 conventions for windowing, IPC/permissions, state, performance, accessibility, cross-platform behavior, and change hygiene (`change-hygiene.md`: state-lifecycle, refactor-invariant, adversarial-input, and integration audits)
- `.ai/conventions/react-tauri/desktop-platform-scope.md` — macOS/Windows-only platform scope, desktop icon outputs, and design-variant port hygiene
