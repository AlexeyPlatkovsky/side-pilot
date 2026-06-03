---
created: 2026-06-02
stage: 00_project_profile
---

# Project Specification — side-pilot

## Project Purpose

Native macOS floating AI assistant. Routes user prompts to local CLI tools (Claude Code CLI, OpenAI Codex CLI, Gemini CLI) from a unified SwiftUI chat panel. No API keys — uses pre-authenticated local CLIs via Swift `Process`. Starts as a draggable floating bubble, expands into a chat panel on hotkey or click.

Primary design specification: `docs/idea.md`

---

## User Role

Solo developer, full-stack owner — designs, builds, and ships the entire app.

---

## Recurring Duties

- Feature implementation and architecture (CLI adapters, routing layer, SwiftUI/AppKit floating window)
- Test writing — unit tests for all non-trivial business logic before a feature is considered done
- Documentation maintenance — keep `docs/idea.md` and `.claude/` docs in sync with structural changes
- Code review of diffs before committing

---

## AI Tool Mode

Multi-tool target app (three CLI adapters built into the product); single AI assistant (Claude Code + agent-manifest framework) building it.

### Exact Tools in Use

| Role | Tool |
|---|---|
| Builder / assistant | Claude Code CLI |
| App target — adapter | Claude Code CLI |
| App target — adapter | OpenAI Codex CLI |
| App target — adapter | Gemini CLI |

---

## Quality Expectations

**Strict.**

- Unit tests required for all non-trivial logic (CLI adapters, routing layer, session model, local storage) before a feature is considered done
- UI tested manually
- Documentation updated when project structure, commands, contracts, or domain facts change
- CI-style validation run locally before features close
- External best-practice research approved — summarize findings and ask before adopting

---

## Known Capability Triggers

| Trigger | Capability needed |
|---|---|
| Any AI landscape | instruction-evaluator agent |
| New or materially changed skills, pipelines, agents, routing, validation gates, or output contracts | artifact-acceptance-tester agent |
| Multi-tool architecture decisions (adapter design, storage format, session model) | brainstorming capability |
| CLI adapter implementation (non-trivial, multi-step) | implement-cli-adapter pipeline |
| Non-trivial routed work | explicit validation + task-complete capability |
| Feature implementation or refactoring that changes structure, commands, contracts, or domain facts | documentation maintenance capability |
| Routing must choose between multiple adapters or capabilities | manager capability |

---

## Domain Vocabulary

| Term | Meaning |
|---|---|
| floating bubble | Small always-on-top draggable window — the app's collapsed state |
| assistant panel | Expanded chat UI shown on hotkey or click |
| CLI adapter | Swift type that wraps one CLI tool (CodexAdapter, ClaudeAdapter, GeminiAdapter) |
| AI routing layer | Component that maps slash commands and model selector to the correct adapter |
| local session | App-owned conversation history (independent of CLI-native sessions) |
| slash commands | `/codex` `/claude` `/gemini` `/all` `/summarize` |
| `Process` | Swift Foundation class used to spawn CLI subprocesses |
| active window context | macOS foreground app name, window title, selected text, clipboard — passed as prompt context |
| `NSPanel` | AppKit floating window type used for the assistant panel |

---

## Authoritative Local Sources

| Source | Purpose |
|---|---|
| `docs/idea.md` | Primary design specification — single source of truth for features, MVP scope, and architecture intent |
| `side-pilot/side_pilotApp.swift` | App entry point |
| `side-pilot/ContentView.swift` | UI root |

---

## Accepted External Best Practices

None yet. External research is approved — findings will be summarized and presented before adoption.

---

## Open Profile Gaps

| Gap | Status |
|---|---|
| Storage format: SQLite vs local JSON | Deferred — `docs/idea.md` notes both; SQLite preferred post-MVP |
| App Store vs direct distribution | Deferred |
| VS Code companion extension scope | Post-MVP; not in current build scope |
