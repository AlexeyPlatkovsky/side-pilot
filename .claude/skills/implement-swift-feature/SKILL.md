---
name: implement-swift-feature
description: Implement a SwiftUI/AppKit feature in side-pilot with unit tests for all non-trivial logic.
---

# Skill: implement-swift-feature

## Purpose

Implement a feature of the side-pilot macOS app in Swift. This skill runs in the working context, may interact with the user mid-task, and produces an output artifact that gates downstream validation and documentation maintenance.

## When This Skill Applies

Use when:
- a feature is ready to be implemented (design decisions are resolved, manager routing plan exists)
- the feature involves SwiftUI views, AppKit integration, Swift business logic, or macOS system API usage

Do not use when:
- design decisions are still open — invoke `brainstorm` first
- the manager routing plan (`Manager: manager - output below`) is absent from the conversation

## Before Implementing

1. Confirm the manager's routing plan is present in the conversation.
2. Load `docs/idea.md` for the relevant feature's design intent.
3. Confirm open design decisions are resolved. If any remain, stop and invoke `brainstorm`.

## Implementation Steps

1. **Scope** — State the files to be created or modified and the acceptance criteria before writing any code.
2. **Implement** — Write the Swift/SwiftUI/AppKit code.
3. **Test** — Write unit tests for all non-trivial logic. Tests must cover the happy path and at least one failure path per non-trivial behavior.
4. **Compile** — Verify the project compiles without errors before emitting the output artifact.

## Quality Requirements (non-negotiable)

- Unit tests are required for all non-trivial business logic before the feature is considered done.
- UI-only changes may be tested manually; explicitly state this in the output artifact.
- If the project does not compile after implementation, the step is not complete.

## Output Contract

Emit before the validation step:

`Skill: implement-swift-feature - output below`

| Status | Files Changed | Tests Written | Compile Status |
|--------|---------------|---------------|----------------|
