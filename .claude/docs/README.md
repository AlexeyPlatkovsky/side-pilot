# .claude/docs — Documentation Index

| Doc | Contents | When to read |
|---|---|---|
| `project_specification.md` | Project profile: purpose, user role, recurring duties, quality expectations, capability triggers, domain vocabulary | Before any substantive project work; when profile context is needed |
| `README.md` (project root) | Developer guide: prerequisites, build/dev/test commands, source layout, cross-platform notes | When setting up the project, building, or running tests |
| `docs/idea.md` (project root) | Primary design specification: features, MVP scope, UI concept, CLI adapter pattern, CLI invocation contract (non-interactive modes, binary/env resolution, permission posture, error taxonomy, adapter interface), session model, macOS API list, risks, recommended build order | When evaluating product scope, intended behavior, architecture intent, or feature priority |
| `docs/architecture/README.md` (project root) | Implemented architecture index: source tree, current scope, lifecycle, design decisions, and routing to focused UI, IPC, Rust core, and database architecture files | Before implementation, discovery, triage, or documentation maintenance that touches existing UI, IPC, Rust core, adapters, links, storage, sessions, or messages; read only the focused sub-file(s) named by the index |

## Workflow Notes

- Non-trivial UI design variants route through `.claude/pipelines/implement-design-variant.md`.
- side-pilot targets macOS and Windows desktop only; generated iOS/Android assets are outside scope unless the user explicitly changes platform targets.
- Non-trivial validation evidence comes from `.claude/agents/test-runner.md`; non-trivial visual review comes from `.claude/agents/design-reviewer.md`.
- UI/interaction changes require runtime validation in the real Tauri window (WKWebView) or the WebKit harness, with captured evidence; Vitest + jsdom passing is necessary but not sufficient (`AGENTS.md` → Quality Gates).
