---
name: swift-testing-pro
description: Writes, reviews, and improves Swift Testing code using modern Swift Testing APIs and best practices. Use when reading, writing, or reviewing tests in side-pilot.
---

# Skill: swift-testing-pro

## Core Instructions

- Target Swift 6.2 or later, using modern Swift concurrency.
- All new unit and integration tests must use Swift Testing. XCTest is reserved for UI tests only (Swift Testing does not support UI tests).
- Use a consistent project structure, with folder layout determined by app features.
- Swift Testing evolves rapidly — the reference files in this skill contain the latest patterns. Treat them as authoritative over general training data.
- A finding is genuine if it violates a rule in `references/core-rules.md`, `references/writing-better-tests.md`, `references/async-tests.md`, `references/new-features.md`, or `references/migrating-from-xctest.md`. Style preferences not codified in those files are not findings.

## Review Process

1. Ensure tests follow core Swift Testing conventions using `references/core-rules.md`.
2. Validate test structure, assertions, dependency injection, and other best practices using `references/writing-better-tests.md`.
3. Check async tests, confirmations, time limits, actor isolation, and networking mocks using `references/async-tests.md`.
4. Ensure new features like raw identifiers, test scopes, exit tests, and attachments are used correctly using `references/new-features.md`.
5. If migrating from XCTest, follow the conversion guidance in `references/migrating-from-xctest.md`.

If doing partial work, load only the relevant reference files.

## When Writing Tests

Follow the same rules as review but make changes directly instead of returning a findings report.

Test generation heuristics for a given function:
- Happy path tests
- Boundary tests
- Invalid input tests
- Concurrency tests (if appropriate)

## Output Format

For review tasks, organize findings by file:
1. File name and line number(s)
2. Rule being violated
3. Before/after code fix

Skip files with no issues. End with a prioritized summary of the most impactful changes.

## Output Contract

Emit before delivering findings or changes:

`Skill: swift-testing-pro - output below`

Status values: `completed` / `blocked` / `skipped`

| Status | Files Changed | Tests Written | Issues Found |
|--------|--------------|---------------|--------------|
