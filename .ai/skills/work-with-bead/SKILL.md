---
name: work-with-bead
description: Check, create, update, and maintain Beads work items for applicable non-trivial side-pilot work.
---

# Skill: work-with-bead

## Purpose

Use Beads as the local issue tracker for applicable non-trivial side-pilot work. Keep Beads items detailed enough that another AI agent with an empty context can implement a task from scratch after reading the task and, when needed, its parent feature or epic.

## When This Skill Applies

Use this skill when the manager routes the Beads planning gate, or when planning, decomposing, creating, updating, or closing Beads items for side-pilot work.

Do not create or update Beads items for trivial work: single-step, low-risk work with no behavioral, structural, command, contract, or domain-fact change.

Beads exemption follows the non-trivial exempt categories defined in AGENTS.md § Beads Planning Gate. Do not restate the list here; refer to the root contract as the single source of truth.

## Repository Setup Rules

- Use the existing project-local Beads database in embedded mode.
- Run only one `bd` command at a time; embedded mode uses an exclusive database lock and concurrent `bd` commands can fail.
- Do not run `bd setup`, `bd hooks install`, `bd onboard`, or commands that write AI editor integrations, generated agent instructions, hooks, skills, pipelines, managers, or root contracts.
- Project-specific Beads workflow rules live only in this skill unless the user explicitly approves another instruction-system change.
- Use Beads CLI commands from the repository root.

## Beads CLI Mechanics

- Do not run multiple `bd` commands in parallel, even when they are read-only adjacent to writes. Treat Beads embedded mode as a single-command critical section.
- When creating an item with a required explicit project ID, do not pass `--id` and `--parent` in the same `bd create` command. Beads rejects that combination.
- To create a child item with an explicit `SP-NNN` ID:
  1. Run `bd create --id SP-NNN ...` without `--parent`.
  2. Run `bd update SP-NNN --parent <parent-id>` after creation succeeds.
  3. Verify the parent link with `bd children <parent-id>` or `bd list --json`.
- Add blocking dependency edges only after both endpoint items exist and after required parent updates have succeeded.
- Use `bd children <parent-id>` for compact hierarchy verification. Use `bd list --json` when full fields, dependencies, labels, or ID sequence checks are needed.
- Treat `parent-child` relationships shown in `bd list --json` as hierarchy metadata, not as blocking dependency edges.
- A child displayed with a blocked marker can be blocked by planned dependencies while still open. Verify `status`, `dependency_count`, and dependency types before reporting item state.

## Relevant Bead Check

Before starting applicable non-trivial implementation work:

1. Search existing Beads items with `bd list --json`, `bd search <terms>`, or another read-only Beads query.
2. Decide whether an existing item covers the requested work by comparing the title, description, acceptance criteria, parent hierarchy, and dependencies.
3. If a relevant item exists, report its ID and use it as the work item. Claim it or move it to in-progress only when implementation is about to start.
4. If no relevant item exists, stop and ask the user whether to create the relevant Beads item before continuing. Recommend the smallest valid shape:
   - task only, when the work is one independent task
   - feature with at least two tasks, when a feature-level grouping is useful
   - epic with at least two features or at least two direct tasks, when epic-level coordination is useful
5. Do not create a Beads item until the user agrees.

## ID Rules

Every permanent Beads item created for this project must use an explicit ID in this exact format:

```text
SP-NNN
```

`NNN` is a zero-padded decimal sequence number such as `001`, `002`, or `127`.

**Never run `bd create` without `--id`.** Plain `bd create` mints a hash-style ID (e.g. `SP-0gx`, `SP-a3f2dd`), which breaks the sequence. `--id SP-NNN` is mandatory on every create.

Before creating any item:

1. Inspect existing Beads IDs with `bd list --json` or an equivalent read-only query. Include closed items (e.g. `bd list --all --json`) so the sequence is not reused — closed items are hidden by default.
2. Consider only IDs that match `^SP-[0-9]{3}$`.
3. Pick the next unused sequence number: highest existing `NNN` plus one, or `SP-001` when none exist.
4. Create the item with `bd create --id SP-NNN`.
5. If `bd create --id SP-NNN` fails (e.g., duplicate ID from a concurrent agent), re-run `bd list --all --json` to re-scan existing IDs, pick the next unused sequence number, and retry. Repeat up to three times before reporting a blocking error.

Do not create hash-style IDs such as `SP-a3f2dd`.

### Recovering a non-conforming ID

This applies only to repairing a freshly-minted non-conforming (hash-style) ID — **never** to renumber a conforming `SP-NNN` item.

`bd delete --force` is destructive and irreversible: it discards the item's audit trail (creation/transition timestamps, change log), which recreation cannot restore — only capturable state (content, comments, dependencies, status) is replayed. If the non-conforming item is already referenced by other items or has accumulated meaningful history, **confirm with the user before deleting**.

**Do not use `bd rename`** to fix a hash ID: `bd rename` rejects a purely numeric suffix (it errors `invalid new ID format "SP-NNN": must be prefix-suffix`), so it cannot turn a hash ID into `SP-NNN`. Instead recreate it (one `bd` command at a time):

1. Capture full content with `bd show <old-id> --json` (title, type, priority, labels, description, design, acceptance, parent, status, comments) **and** inbound references — any other items whose parent or dependency is the old ID (`bd list --json`).
2. Delete the offending item(s) with `bd delete <id> --force`; delete children before their parent.
3. Recreate with `bd create --id SP-NNN`, re-supplying every captured field (`--type`, `--priority`, `--labels`, `--description`, `--acceptance`, `--design`) per "Item Detail Rules" — do not recreate a stub. For a child, create without `--parent`, then `bd update SP-NNN --parent <parent-id>`.
4. Restore all edges and state: re-parent any orphaned children, re-point inbound dependencies that referenced the old ID, re-add comments, and re-close with `bd close` if the original was closed.

## Hierarchy Rules

Use a hierarchy only when it adds real planning value.

- Preferred shape: epic -> feature -> task.
- Create an epic only when it contains at least two child features or at least two direct child tasks.
- Create a feature only when it contains at least two child tasks.
- If a proposed epic would contain exactly one feature, skip the epic and create the feature or tasks directly.
- If a proposed feature would contain exactly one task, skip the feature and create the task directly.
- Record parent links so hierarchy is visible through Beads parent-child relationships. When creating an item with an explicit `SP-NNN` ID, create it first and then run `bd update SP-NNN --parent <parent-id>`; do not pass `--id` and `--parent` together.
- Do not use dependency edges as a substitute for hierarchy.

## Dependency Rules

Maintain dependencies between items whenever execution order, blocking, or handoff matters.

- Use dependency edges for actual blocking relationships only.
- Use `bd dep add <blocked-id> <blocker-id>` when `<blocked-id>` cannot proceed until `<blocker-id>` is done.
- Equivalent shorthand: `bd dep <blocker-id> --blocks <blocked-id>`.
- Add dependencies after both items exist.
- Check for cycles with `bd dep cycles` after creating or changing dependency sets.
- Do not add dependencies merely because items share a parent.

## Item Detail Rules

Every Beads item must be implementable from scratch by an AI agent with no prior conversation context.

Epics must include:

- goal and user-visible outcome
- scope boundaries and explicit non-goals
- child breakdown expectations
- important cross-feature dependencies or sequencing
- authoritative source files or docs to read first

Features must include:

- behavior to deliver
- parent epic context when a parent exists, without duplicating the full epic
- UX, API, storage, command, or architecture constraints that affect implementation
- required child task breakdown
- dependencies on other features or tasks
- validation expectations
- BDD scenario coverage for feature-level workflows in `docs/features/<feature-id>-<feature-name>/<feature-id>-<feature-name>.feature` (feature file uses the feature slug for both directory and filename)

Tasks must include:

- concrete implementation objective
- parent feature or epic to read first when context would otherwise be duplicated
- target files, modules, commands, or interfaces when known
- acceptance — Definition of Done checklist in `--acceptance`, BDD scenarios in `docs/features/<feature-id>-<feature-name>/<task-id>-<task-name>.feature`; set `--spec-id` to the BDD file path so the link is visible in the Beads item (use `--spec-id` on `bd create` when creating the task, or `bd update` when the file is created after the task already exists)
- test or manual validation expectations
- dependencies on other tasks
- documentation updates needed, or an explicit statement that none are expected

Use Beads fields for detail instead of hiding requirements in the title:

- `--description` for the main implementation context
- `--acceptance` for the **Definition of Done checklist** — a bullet list of verifiable conditions. Each bullet must be objectively pass/fail. This is the concise done criterion, not the full behavioral specification.
- `--design` or `--context` for constraints, references, and rationale
- `--labels` for searchable categories such as `frontend`, `rust`, `tauri`, `docs`, or `cli-adapter`
- `--priority` only when the user or plan gives a real priority signal

## BDD Scenario Files

Tasks with behavioral expectations that can be expressed as concrete Given/When/Then steps must include BDD scenario specifications as separate Gherkin files. Tasks without behavioral change — pure refactors, performance tuning, DB migrations, or similar — may skip scenario files.

Feature-level BDD coverage is required unless all child task scenarios collectively cover every feature workflow. Create or update the feature-level scenario file when the feature is created or when child task scenarios no longer collectively cover every feature workflow.

- File path: `docs/features/<feature-id>-<feature-name>/<task-id>-<task-name>.feature` for tasks with a parent feature; use `docs/features/tasks/<task-id>-<task-name>.feature` for standalone tasks that have no parent feature. Standalone tasks must always use the literal `docs/features/tasks/` folder, not a task-specific subfolder. For tasks whose direct parent is an epic (no intervening feature), treat the epic as the feature: `docs/features/<epic-id>-<epic-name>/<task-id>-<task-name>.feature`.
- `<feature-name>` and `<task-name>` are the slug only — `SP-NNN` is a fixed prefix and is not counted in the word limit. The slug is 2–4 words from the title, hyphen-separated; omit standard English stop words (articles, prepositions, conjunctions — e.g. the, a, an, of, with, for, in, to, and, or, by, on, at, from, as) and the item-type word (task, feature, epic). Use lowercase for all slug words; preserve conventional casing for initialisms and acronyms (e.g. AI, UI, CLI, HTTP). If the title yields fewer than 2 words after filtering, use all available words. If the title is a single word, use that word as the slug. Examples: `SP-015-AI-switcher`, `SP-016-implement-route-planner`.
- Format: Standard Gherkin (`Feature:` / `Scenario:` / `Given` / `When` / `Then` / `And` / `But`)
- Each scenario covers one behavioral case: happy path, error state, edge case, or permission denial
- Scenario files are the authoritative behavior specification for implementation and testing — not a prose supplement to `--acceptance`, but the structured specification itself

Example structure for `docs/features/SP-015-AI-switcher/SP-016-implement-route-planner.feature`:

```gherkin
Feature: Multi-tool transcript replay and routing
  As a user I want to route prompts to one or all assistants
  so that I can compare responses and get synthesized results

  Scenario: Route a prompt to a single selected assistant
    Given the user has selected "Codex" as the target assistant
    When the user submits a prompt
    Then the route planner returns only the Codex adapter target
    And the transcript composer includes prior relevant turns in deterministic order

  Scenario: Route to all assistants concurrently
    Given the user has selected "All" as the target
    When the user submits a prompt
    Then the route planner prepares concurrent requests for all available adapters
    And partial failure for one adapter does not cancel other adapter requests
```

Rules:

- Set `--spec-id <path>` on the Beads item to the scenario file path when the file is created, so the link is visible in the Beads item; update `--spec-id` via `bd update` whenever the scenario file path changes (e.g. on rename or rescope).
- Create or update the scenario file whenever the task's acceptance criteria or behavioral expectations change.
- Keep the DoD checklist in `--acceptance` focused on verifiable outcomes. The detail lives in the scenario file.
- When implementing, the scenario file is the primary specification an AI agent or developer reads first after the Beads item.

## Work Update Rules

- Claim or move an item to in-progress before starting non-trivial implementation work tied to that item.
- Add comments or notes when important decisions, blockers, or scope changes appear during execution.
- Update dependency edges when sequencing changes.
- Close an item only after its acceptance criteria and required validation are satisfied. Before closing a task that has a scenario file, verify that `--spec-id` is set to the correct path.
- If implementation reveals that a Beads item is too broad, split it into compliant children and preserve dependencies.

## Output Contract

When this skill gates later work, begin with:

`Skill: work-with-bead - output below`

Then report:

| Status | Items Created / Updated | Dependencies | Validation |
|--------|--------------------------|--------------|------------|

`Status` must be one of: `completed`, `skipped`, or `blocked`.
