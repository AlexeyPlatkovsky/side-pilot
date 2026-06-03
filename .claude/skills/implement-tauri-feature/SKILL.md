---
name: implement-tauri-feature
description: Implement a Tauri v2 + React + TypeScript feature in side-pilot (React UI and/or Rust core), with unit tests for all non-trivial logic.
---

# Skill: implement-tauri-feature

## Purpose

Implement a feature of the side-pilot desktop app across the React front-end and/or the Rust (Tauri) core. This skill runs in the working context, may interact with the user mid-task, and produces an output artifact that gates downstream validation and documentation maintenance.

## When This Skill Applies

Use when:
- a feature is ready to be implemented (design decisions are resolved, manager routing plan exists)
- the feature involves React/TypeScript UI, Rust commands/logic, Tauri windowing/plugins, or storage

Do not use when:
- design decisions are still open — stop and report the unresolved decision
- the manager routing plan (`Manager: manager - output below`) is absent from the conversation
- the feature is a CLI adapter — use the `implement-cli-adapter` pipeline instead
- the request is test authoring or review with no feature implementation

## Before Implementing

1. Confirm the manager's routing plan is present in the conversation.
2. Load `docs/idea.md` for the relevant feature's design intent (stack, MVP scope, contract).
3. Confirm open design decisions are resolved. If any remain, stop and report the unresolved decision as a blocker.
4. Load the relevant convention files from `.claude/conventions/react-tauri/` for the touched surface: windowing, IPC/permissions, state, accessibility, performance, or cross-platform.
   - Also load `desktop-platform-scope.md` when changing app icons, bundle assets, dev ports, window dimensions, or UI design variants.

## Implementation Steps (TDD: Red → Green → Refactor)

1. **Scope** — State the files to be created/modified (front-end and/or Rust) and the acceptance criteria before writing any code.
2. **Design data flow** — Identify component-local vs Zustand vs TanStack Query state; identify which logic belongs in the Rust core vs the front-end.
3. **Write tests first (Red)** — Before writing production code, write unit tests for all non-trivial logic: front-end (Vitest + RTL; follow `.claude/skills/testing-pro/references/frontend.md`) and/or Rust (cargo-nextest + tokio + mockall; follow `.claude/skills/testing-pro/references/rust.md`). Cover happy path and at least one failure path per non-trivial behavior. Confirm tests compile and **fail** at this point.
4. **Implement Rust side (if any)** — Add commands as thin wrappers over testable functions; add `tauri-specta` types; add the required permission to `src-tauri/capabilities/`. Write only enough code to make the tests from Step 3 pass (Green).
5. **Implement React side (if any)** — Build UI against generated IPC bindings; add accessibility; keep business logic in plain TS modules. Write only enough code to make the tests from Step 3 pass (Green).
6. **Refactor** — Clean up without changing behavior. Tests must remain green throughout.
7. **Build & test** — Verify the front-end builds (`npm run build` / `tsc --noEmit`) and the Rust core compiles (`cargo build`), and that all tests pass, before emitting the output artifact.

## Quality Requirements (non-negotiable)

- **TDD is required**: tests must be written and confirmed failing (Red) before any production code is written. Implementing first and adding tests after is a violation of this gate.
- Pure-UI/visual changes may be tested manually; explicitly state this in the output artifact.
- Every front-end IPC/plugin call must have a matching capability permission.
- If the project does not build (TypeScript or Rust) after implementation, the step is not complete.

## Output Contract

Emit before the validation step:

`Skill: implement-tauri-feature - output below`

| Status | Files Changed (FE/Rust) | Tests Written | Build Status (tsc + cargo) | Tests Pass (FE/Rust) |
|--------|-------------------------|---------------|----------------------------|----------------------|

`Status` is `Complete` only when the build is clean **and** tests pass. If either the build or the tests fail, do not emit this artifact as passing — report the failure as a blocker and return to the relevant Implementation Step. For Rust-only adapter work, `tsc` is N/A (mark it so); for front-end-only work, `cargo` is N/A.
