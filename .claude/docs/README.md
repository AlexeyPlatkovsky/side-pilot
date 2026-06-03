# .claude/docs — Documentation Index

| Doc | Contents | When to read |
|---|---|---|
| `project_specification.md` | Project profile: purpose, user role, recurring duties, quality expectations, capability triggers, domain vocabulary | Before any substantive project work; when profile context is needed |
| `README.md` (project root) | Developer guide: prerequisites, build/dev/test commands, source layout, cross-platform notes | When setting up the project, building, or running tests |
| `docs/idea.md` (project root) | Primary design specification: features, MVP scope, UI concept, CLI adapter pattern, CLI invocation contract (non-interactive modes, binary/env resolution, permission posture, error taxonomy, adapter interface), session model, macOS API list, risks, recommended build order | When implementing features, making architecture decisions, or evaluating scope |

## Workflow Notes

- Non-trivial UI design variants route through `.claude/pipelines/implement-design-variant.md`.
- side-pilot targets macOS and Windows desktop only; generated iOS/Android assets are outside scope unless the user explicitly changes platform targets.
- Non-trivial validation evidence comes from `.claude/agents/test-runner.md`; non-trivial visual review comes from `.claude/agents/design-reviewer.md`.
