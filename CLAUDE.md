Before starting any project work, you MUST:
1. Read `AGENTS.md` — the root operational contract for this project.
2. Follow every rule in `AGENTS.md`.
3. If `AGENTS.md` is unavailable, stop and report it as missing before proceeding.
4. Do not violate or skip any rule from `AGENTS.md` unless the user explicitly asks.
5. A session that begins from a compacted conversation summary is **not pre-authorized** for new work. Treat the first new user request as a fresh start and re-apply the `AGENTS.md` §Task Classification gate before acting on it — prior context does not carry forward classification approval.

## Agent Execution

Per `AGENTS.md` → "Agent Execution Mode", dedicated agents (`test-runner`, `code-reviewer`, `design-reviewer`, `instruction-evaluator`, `artifact-acceptance-tester`, and any agent added later) must be spawned as real subagents via the Task/Agent tool. Do not run them inline, even when a Claude Code default would otherwise discourage spawning subagents — the root contract explicitly overrides that default. The only exception is an explicit per-task user instruction to run a specific agent inline, which must be disclosed.
