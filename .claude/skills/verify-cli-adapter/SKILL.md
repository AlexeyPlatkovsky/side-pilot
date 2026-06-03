---
name: verify-cli-adapter
description: Verify CLI adapter correctness after implementation — command construction, Process I/O, error handling, timeout, and output parsing.
---

# Skill: verify-cli-adapter

## Purpose

Run targeted correctness checks on a newly implemented CLI adapter (ClaudeAdapter, CodexAdapter, or GeminiAdapter) before validation and documentation maintenance. This skill reads the implemented adapter code and its tests. It does not modify files.

## When This Skill Applies

Use after `implement-swift-feature` in the `implement-cli-adapter` pipeline.

Do not use for general SwiftUI/AppKit feature verification. This skill is scoped to CLI adapter code only.

## Checks

For the adapter under review, verify each of the following:

| Check | What to look for |
|---|---|
| Command construction | The correct CLI binary name and required flags are used; arguments are passed correctly |
| `Process` wiring | `executableURL`, `arguments`, `standardOutput`, `standardError` are set before `launch()` |
| Stdout async reading | Output is read asynchronously (e.g. `FileHandle.readabilityHandler` or async stream); not blocking the main thread |
| Stderr async reading | Errors are captured on a separate pipe from stdout |
| Error handling | Non-zero `terminationStatus` is detected and surfaced as a thrown error or reported failure |
| Timeout handling | A timeout mechanism exists; the process is terminated if it exceeds the defined limit |
| Output parsing | The raw stdout string is parsed to extract the meaningful response; parsing has unit tests |
| Unit test coverage | Each of the above behaviors has at least one unit test |

## Failure Behavior

If any check is `Fail`:
- stop and describe the specific problem
- do not advance to the validation step
- return to `implement-swift-feature` to address the issue

## Output Contract

Emit before the validation step:

`Skill: verify-cli-adapter - output below`

| Check | Status | Notes |
|-------|--------|-------|
| Command construction | Pass / Fail / Skipped | |
| Process stdout pipe | Pass / Fail / Skipped | |
| Process stderr pipe | Pass / Fail / Skipped | |
| Async output reading | Pass / Fail / Skipped | |
| Error handling | Pass / Fail / Skipped | |
| Timeout handling | Pass / Fail / Skipped | |
| Output parsing | Pass / Fail / Skipped | |
| Unit test coverage | Pass / Fail / Skipped | |

`Skipped` requires a one-line reason in Notes.
