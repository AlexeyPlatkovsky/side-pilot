Before starting any project work, you MUST:
1. Read `AGENTS.md` — the root operational contract for this project.
2. Follow every rule in `AGENTS.md`.
3. If `AGENTS.md` is unavailable, stop and report it as missing before proceeding.
4. Do not violate pr skip any rule from `AGENTS.md` until user asks another.

## Agent Execution

Per `AGENTS.md` → "Agent Execution Mode", dedicated agents (`test-runner`, `code-reviewer`, `design-reviewer`, `instruction-evaluator`, `artifact-acceptance-tester`, and any agent added later) must be spawned as real subagents via the Task/Agent tool. Do not run them inline, even when a Claude Code default would otherwise discourage spawning subagents — the root contract explicitly overrides that default. The only exception is an explicit per-task user instruction to run a specific agent inline, which must be disclosed.
