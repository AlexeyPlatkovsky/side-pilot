---
name: work-with-git
description: Manage git branch selection for side-pilot tasks and report the commit/push boundary.
---

# Skill: work-with-git

## Purpose

Keep side-pilot work on an appropriate git branch before edits begin, without committing or pushing unless the user explicitly asks.

## When This Skill Applies

Use this skill when the manager routes non-trivial work before edits begin, or when the user asks about task branch strategy.

For trivial work, do not create or switch branches by default. Perform the change in the current task branch unless the user asks for a different branch.

## Branch Rules

- Non-trivial tasks must not be implemented on `main` unless the user explicitly says to work on `main`.
- Create new task branches only from `origin/main` unless the user explicitly names another base.
- If the task has a Beads ID, name the branch:

```text
feature/SP-NNN-bead-title
```

- Build `bead-title` from the Beads title as a lowercase kebab-case slug using 3-6 meaningful words.
- If the task continues current work and the current branch name and uncommitted changes match the task, keep working on the current branch.
- It is acceptable to perform a child task on a branch named for its parent feature or epic when the branch clearly covers the requested work.
- If the current branch or uncommitted changes appear unrelated to the requested task, stop and ask the user whether to create a new branch or stay on the current branch.
- If no Beads ID applies and a new branch is needed, use a kebab-case task slug of 3-6 meaningful words. Follow tool-specific branch prefix rules when they exist.
- Never delete, reset, rebase, stash, or overwrite user changes unless the user explicitly approves that operation.

## Commit And Push Rules

- Do not commit unless the user explicitly asks.
- Do not push unless the user explicitly asks.
- After completing a task that changed files, suggest one short informative commit message.

## Recommended Checks

Before edits:

1. Inspect `git status --short --branch`.
2. If a new branch is needed, run `git fetch origin main` before branch creation when network access is available.
3. If fetching fails but local `origin/main` exists, create the branch from local `origin/main` and report the fetch failure in this skill's output.
4. If `origin/main` is missing, stop and ask the user for the branch base.
5. Check whether uncommitted changes are present and whether they appear related to the task.
6. After creating a new branch, immediately publish it with `git push -u origin <branch-name>`. This sets the upstream tracking reference and makes the branch visible on the remote without requiring an empty commit. Report the push result in the output.

After edits:

1. Inspect `git status --short`.
2. Report changed files and whether anything remains unstaged or uncommitted.
3. Suggest a commit message when files changed.

## Output Contract

When this skill gates non-trivial routed work, begin with:

`Skill: work-with-git - output below`

Then report:

| Status | Branch Decision | Base | Remote Published | Commit / Push Boundary |
|--------|-----------------|------|-----------------|------------------------|

`Status` must be one of: `completed`, `skipped`, or `blocked`.
