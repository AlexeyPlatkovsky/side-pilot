---
name: verify-cli-adapter
description: Verify CLI adapter correctness after implementation — command construction, subprocess I/O, error handling, timeout, cancellation, and structured-output parsing in the Rust/Tauri core.
---

# Skill: verify-cli-adapter

## Purpose

Run targeted correctness checks on a newly implemented CLI adapter (ClaudeAdapter, CodexAdapter, or GeminiAdapter) in the Rust core before validation and documentation maintenance. This skill reads the implemented adapter code and its tests. It does not modify files.

## When This Skill Applies

Use after `implement-tauri-feature` in the `implement-cli-adapter` pipeline.

Do not use for general React/Tauri feature verification. This skill is scoped to CLI adapter (Rust) code only.

## Preconditions

Before verification, require:
- the adapter name under review
- the adapter implementation files or current implementation diff
- `Skill: implement-tauri-feature - output below` in the conversation
- `docs/idea.md` loaded for the CLI Invocation Contract

If any precondition is missing, emit the output artifact with `Fail` rows and name the missing input.

## Checks

For the adapter under review, verify each of the following against the CLI Invocation Contract in `docs/idea.md`:

| Check | What to look for |
|---|---|
| Command construction | Correct CLI binary + required flags (e.g. `codex exec --json -s read-only`, `--skip-git-repo-check`); arguments passed correctly |
| Binary/env resolution | Binary resolved to an absolute path (not bare `PATH` lookup); login-shell-derived env on macOS / known-location lookup on Windows; cached |
| Subprocess wiring | `std::process::Command` / `tauri-plugin-shell` configured with program, args, working directory, stdout/stderr capture; runs async (non-blocking) |
| Structured-output parsing | The tool's JSON/JSONL is parsed into a typed result (not regexed raw text); ANSI stripped; parsing is unit-tested |
| Error handling | Non-zero exit and tool-reported failures map to the `AdapterError` taxonomy (binaryNotFound / notAuthenticated / nonZeroExit / outputParseFailure) |
| Timeout handling | A timeout terminates the process and returns `timedOut`; deterministic in tests (injected time, mocked runner) |
| Cancellation | User cancellation terminates the process and returns `cancelled` |
| Trait-mocked tests | Subprocess effects are behind a trait and mocked (`mockall`); no real CLI is spawned in unit tests |
| Unit test coverage | Each of the above behaviors has at least one test (`cargo nextest run` / `cargo test`) |

## Failure Behavior

If any check is `Fail`:
- stop and describe the specific problem
- do not advance to the validation step
- report the failed check so the pipeline or manager can return to implementation

## Output Contract

Emit before the validation step:

`Skill: verify-cli-adapter - output below`

| Adapter | Files Reviewed |
|---------|----------------|

| Check | Status | Notes |
|-------|--------|-------|
| Command construction | Pass / Fail / Skipped | |
| Binary/env resolution | Pass / Fail / Skipped | |
| Subprocess wiring | Pass / Fail / Skipped | |
| Structured-output parsing | Pass / Fail / Skipped | |
| Error handling | Pass / Fail / Skipped | |
| Timeout handling | Pass / Fail / Skipped | |
| Cancellation | Pass / Fail / Skipped | |
| Trait-mocked tests | Pass / Fail / Skipped | |
| Unit test coverage | Pass / Fail / Skipped | |

`Skipped` requires a one-line reason in Notes. A missing precondition must be recorded as `Fail`, not `Skipped`.
