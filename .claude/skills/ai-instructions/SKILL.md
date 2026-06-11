---
name: ai-instructions
description: Plan, edit, and self-check changes to AI instruction artifacts (AGENTS.md, skills, pipelines, agents, conventions) in side-pilot.
---

# Skill: ai-instructions

## When This Skill Applies

Use when making changes to AI instruction artifacts:
- root contract (`AGENTS.md`)
- manager routing rules (`task-routing/SKILL.md`)
- pipeline files (`.claude/pipelines/`)
- skill files (`.claude/skills/`)
- agent files (`.claude/agents/`)
- convention files (`.claude/conventions/`)
- output contracts, validation gates, or other instruction-system files

Do not use for:
- product source code (Rust/TypeScript/React)
- non-instruction documentation files (`docs/`, READMEs, changelogs)
- trivial single-line copy edits

## Before You Begin

Read the following context before planning any change:

1. `AGENTS.md` — root contract, especially §Instruction System Changes and §Final Response Gate
2. The target artifact(s) to be changed
3. Any artifacts that reference the target (e.g., if changing a skill, check pipelines and routing that invoke it)
4. `.claude/skills/task-routing/SKILL.md` — to verify the change is consistent with routing rules
5. `.claude/docs/capabilities.md` — to verify the capability is registered if creating a new skill, pipeline, or agent

## Steps

### 1. Plan

State the change plan out loud before making edits:
- files to create, modify, or delete
- the responsibility change for each artifact
- any cross-references that must be updated
- any routing entries or manager rules affected

### 2. Load Target

Read the current content of each file to be modified. For new files, confirm the target path does not already exist. If a file listed as "to modify" does not exist on disk, report it as a precondition failure and block. Do not proceed to Edit until the plan is corrected.

### 3. Edit

Make the required edits. Follow these rules:
- Create new files with `.md` extension in the appropriate `.claude/` subdirectory
- Use the `edit` tool for existing files, matching exact whitespace
- Update cross-references in all files that reference the changed artifact
- Never duplicate content already owned by another artifact — use cross-references instead

### 4. Hygiene Self-Check

After editing, verify:

- All file paths referenced in the changed artifacts exist
- All cross-references between artifacts are consistent and correct
- No circular references between changed artifacts
- Layer purity is preserved (skill does not sequence sibling skills, pipeline only references skills/agents/single-line commands, agent does not duplicate root policy)
- No duplicate responsibilities or content across artifacts
- The change does not contradict `AGENTS.md` or `task-routing/SKILL.md`
- If a routing entry changed, every router reference that points to the old target has been updated

## Output Contract

Emits:

`Skill: ai-instructions - output below`

| Status | Files Changed | Summary |
|--------|---------------|---------|
