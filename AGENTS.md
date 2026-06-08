# AGENTS.md — side-pilot Root Contract

This file is the root operational contract for the side-pilot project.
All AI tools working on this project must read this file before starting any work.
This file overrides any tool-specific adapter on conflict.

---

## Project

Cross-platform desktop (macOS + Windows) floating AI assistant. Routes user prompts to local CLI tools (Claude Code CLI, OpenAI Codex CLI, Gemini CLI) via the Rust core (`std::process::Command` / `tauri-plugin-shell`). Built with **Tauri (Rust) + React + TypeScript**.

Primary design specification: `docs/idea.md`
Implemented architecture reference: `docs/architecture/README.md`
Project profile: `.ai/docs/project_specification.md`

---

## Task Classification

Before any file is created, edited, or deleted, classify the task out loud:

**Trivial** — single-step, low-risk, no behavioral change.
Proceed directly. State the classification.

**Non-trivial** — multi-step, or changes behavior, structure, commands, contracts, or domain facts:
1. Stop.
2. Load `.ai/manager/MANAGER.md`.
3. Do not implement until the manager emits its visible routing plan (`Manager: manager - output below`).

When unsure, treat as non-trivial.

Any user request to create, modify, or delete a file is an implicit "proceed" signal — classify it before acting, regardless of phrasing. A direct imperative ("modify ci.yml", "fix the test", "update the docs") carries the same obligation as "go ahead" or "implement it."

After a `Skill: task-complete` closure, every subsequent action request in the same session re-triggers the classification gate. A prior closure does not authorize skipping classification for the next request.

Requirements discovery, scoping, feature refinement, and re-scoping an existing Beads item are non-trivial tasks in their own right. Load the manager immediately for this work — do not wait for an implementation signal.

---

## Beads Planning Gate

For applicable non-trivial work, the manager routes through `.ai/skills/work-with-bead/SKILL.md` before implementation starts. The manager owns the exempt categories list.

When the Beads gate applies:
- check whether a relevant Beads item already exists
- if one exists, use it as the planning/work item
- if none exists, stop and ask the user whether to create the relevant epic, feature, or task before continuing
- never create a Beads item for trivial or exempt work

---

## Quality Gates

These apply to all non-trivial work and may not be skipped:

- **TDD required** for non-trivial logic. Red → Green → Refactor. Front-end: Vitest + React Testing Library; Rust: cargo-nextest + tokio + mockall.
- **Interaction contract first (UI):** state the contract before writing component code. Name the default/initial state and define success as a user-visible outcome.
- **Runtime UI validation required** for any UI or interaction change. Exercise in the real Tauri window (WKWebView) or the WebKit E2E harness. Captured evidence (screenshot, measured sizes). Vitest + jsdom is not sufficient.
- **Documentation maintenance** after any change that affects behavior, interfaces, commands, architecture, or domain facts.
- **Local validation** before a feature closes: touched layers must build and tests must pass.
- **test-runner agent** for non-trivial routed validation. Direct command execution is allowed only for trivial requests.
- **design-reviewer agent** for non-trivial UI or icon work.

---

## Agent Execution Mode

Dedicated agents are first-class executors. They MUST be spawned via `.ai/bin/spawn-agent.py` when a gate requires them (see §Agent Spawning Convention). Inline substitution is prohibited. The spawner reads the agent's `cli`/`model`/`effort` frontmatter and runs the appropriate CLI with the correct model, effort, and bypassed permissions.

---

## Agent Spawning Convention

Every agent file in `.ai/agents/` declares three metadata fields in its frontmatter:

- **`cli`** — which CLI to use: `claude`, `codex`, or `opencode`
- **`model`** — CLI-native model identifier (e.g. `sonnet`, `gpt-5.5`, `opencode/deepseek-v4-flash`)
- **`effort`** — CLI-native reasoning effort: `low`, `medium`, `high`, `xhigh`, `max`

Agents are spawned via `.ai/bin/spawn-agent.py`, which reads the frontmatter, builds the appropriate CLI command, runs it non-interactively with bypassed permissions, and captures the result to an output file.

**Spawn contract:**

```
spawn-agent.py <name> [--input <path>] [--output <path>] [--timeout <sec>]
```

Exit codes: `0` success, `1` agent failure, `2` timeout, `3` infra error.

**Output:** The agent writes its structured result (markdown) to stdout, which the spawner redirects to the output file. The caller reads the output file and parses the `Agent: <name> - output below` artifact label to determine the verdict.

**Input:** Task context is passed via stdin pipe (claude/codex) or `--file` flag (opencode).

**Polling:** The spawner checks process liveness every `$POLL_INTERVAL` seconds (default 10) and terminates after `$DEFAULT_TIMEOUT` seconds (default 600).

**Run artifacts:** The `.ai/run/` directory is for ephemeral I/O files and is gitignored.

---

## Platform Asset Boundary

side-pilot targets **macOS and Windows only**. No iOS/Android assets. Desktop icons must keep the source asset plus macOS/Windows outputs only.

---

## Instruction System Changes

When creating or materially changing any instruction artifact:
- Use `instruction-evaluator` before accepting the artifact.
- Use `artifact-acceptance-tester` before accepting any skill, pipeline, agent, manager routing, validation gate, or output contract.

---

## Final Response Gate

For non-trivial routed work, the final response must include:

- `Skill: task-complete - output below`
- `Agent: test-runner - output below` when validation was required
- `Agent: instruction-evaluator - output below` and `Agent: artifact-acceptance-tester - output below` when instruction artifacts changed

Compact artifacts must preserve the label, status/verdict, and required table shape. Each `Agent:` artifact must originate from an actually spawned subagent.

---

## References

- Full capability registry: `.ai/docs/capabilities.md`
- Authoritative sources: `.ai/docs/project_specification.md` §Authoritative Local Sources
