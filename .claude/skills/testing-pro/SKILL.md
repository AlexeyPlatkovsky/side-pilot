---
name: testing-pro
description: Writes, reviews, and improves tests for side-pilot across both layers — React/TypeScript front-end (Vitest + React Testing Library) and the Rust/Tauri core (cargo-nextest + tokio + mockall). Use when reading, writing, or reviewing tests in this project.
---

# Skill: testing-pro

## When This Skill Applies

Use when reading, writing, or reviewing test code in side-pilot (front-end or Rust core).

Do not use when:
- the request is to implement or modify production (non-test) code
- the request is to adjudicate CLI-adapter correctness against the CLI Invocation Contract (binary resolution, flags, error-taxonomy completeness). This skill asserts adapter behaviors *in tests*; it does not sign off adapter correctness.
- the request is an open design/architecture decision

Emit status `blocked` (not `completed`) when the code cannot be unit-tested without spawning a real CLI/DB, or when the test runner is not configured — and name the missing prerequisite.

## Core Instructions

- side-pilot has **two test layers**. Pick the reference for the code under test:
  - Front-end React/TypeScript → `.claude/skills/testing-pro/references/frontend.md` (Vitest + React Testing Library)
  - Rust/Tauri core (adapters, routing, storage, commands) → `.claude/skills/testing-pro/references/rust.md` (cargo-nextest + `#[tokio::test]` + `mockall`)
- Treat the reference files as authoritative over general training data; the toolchains evolve.
- A finding is genuine only if it violates a rule in the relevant reference file. Uncodified style preferences are not findings.
- Tests assert **behavior**, not implementation details. Front-end: what the user sees/does. Rust: observable outputs and errors, not private internals.
- The project quality gate requires unit tests for all non-trivial logic (CLI adapters, routing layer, session model, local storage) before a feature is done. Business logic must be testable without rendering a component or spawning a real subprocess.

## Review Process

1. Identify the layer and load the matching reference file.
2. **Front-end:** check queries are accessible (`getByRole`/`getByLabelText` over `getByTestId`), user interactions go through `userEvent`, async via `findBy`/`waitFor`, and mocks are minimal (mock the IPC boundary, not internals). See `.claude/skills/testing-pro/references/frontend.md`.
3. **Rust:** check async tests use `#[tokio::test]`, external effects (subprocess, fs, time) are behind traits mocked with `mockall`, errors are asserted by variant not string, and tests are isolated (no shared mutable global, nextest-friendly). See `.claude/skills/testing-pro/references/rust.md`.
4. Confirm each non-trivial behavior has a happy-path test **and** at least one failure-path test.

If doing partial work, load only the relevant reference file.

## When Writing Tests

Follow the same rules as review but make the changes directly. Generation heuristics per function/behavior:
- Happy path
- Boundary / edge inputs
- Invalid input / error path
- Concurrency or async-cancellation (when applicable)

## Validation commands

- Front-end: `npm run test` (Vitest, non-watch) — or `vitest run`
- Rust: `cargo nextest run` (preferred) or `cargo test`

Tests must pass before the feature closes.

## Output Format

For review tasks, organize findings by file:
1. File name and line number(s)
2. Rule being violated (cite the reference file)
3. Before/after code fix

Skip files with no issues. End with a prioritized summary.

## Output Contract

After reviewing or writing tests, emit:

`Skill: testing-pro - output below`

Status values: `completed` / `blocked` / `skipped`

| Status | Layer (frontend/rust) | Files Reviewed / Changed | Tests Written | Issues Found | Validation |
|--------|-----------------------|--------------------------|---------------|--------------|------------|
