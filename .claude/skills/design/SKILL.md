---
name: design
description: Apply and maintain the side-pilot design system — work through the centralized CSS tokens and keep design-book.md in sync. Use for any visual/styling change so values stay tokenized instead of hardcoded.
---

# Skill: design

## Purpose

Make and maintain visual/styling changes in side-pilot through the centralized
design system rather than hardcoded CSS values. The single source of truth is the
token set in `src/styles.css` `:root`; its human-readable reference is
`docs/design-book.md`. This skill keeps the two in sync and prevents new magic
numbers from leaking into component CSS.

## When This Skill Applies

Use when:
- adding or changing spacing, padding, gap, border-radius, color, icon size, or
  type in the UI
- a styling change would otherwise introduce a raw value (e.g. `padding: 13px`,
  `#2f6f63`, `border-radius: 7px`)
- adding, renaming, retiring, or re-snapping a design token
- auditing `src/styles.css` for hardcoded values that should be tokens

Do not use:
- for component logic or behavior changes with no visual/token impact — use
  `implement-tauri-feature`
- for app-icon raster asset work — that is design-variant/icon work under
  `implement-design-variant` and `desktop-platform-scope.md`
- for open visual direction decisions with real trade-offs — resolve those with
  `brainstorm` first

## Before You Start

1. When invoked for non-trivial work or via the `design-system` pipeline, confirm
   the manager routing plan (`Manager: manager - output below`) is present. For a
   trivial, directly-routed styling change through existing tokens, the stated task
   classification is enough.
2. Read `docs/design-book.md` to learn the current scales and semantic tokens.
3. Read the `:root` block of `src/styles.css`.
4. Load `.claude/conventions/react-tauri/accessibility.md` (focus rings, contrast,
   control naming) and `desktop-platform-scope.md` when touching window-facing
   surfaces.

## Rules

### 1. Tokens, never raw values
Component CSS must reference tokens (`var(--space-3)`, `var(--radius-md)`,
`var(--color-text)`), not literals. The only allowed literals are the documented
one-offs in design-book.md (e.g. `min-height: 44px` touch target). If you need a
literal, justify it and record it under "Known one-offs."

### 2. Keep each scale small (3–4 steps)
Do not grow a scale to fit a value. Snap to the nearest existing step. Adding a new
step requires an explicit reason and updates to both `:root` and design-book.md. If
snapping shifts a pixel, that is acceptable and expected — note it as an intended
visual change.

### 3. Primitives stay behind semantics
Color primitives (`--clay`, `--honey`, …) are referenced only to build semantic
tokens. Components use semantic tokens (`--border-soft`, `--color-accent`). Derive
alpha tints with `color-mix()` from a primitive so one change cascades.

### 4. styles.css and design-book.md move together
Any token added, renamed, re-valued, or removed must be reflected in both
`src/styles.css` `:root` and the matching table in `docs/design-book.md` in the
same change. They are never allowed to drift.

### 5. Validation is delegated, not self-certified
Token changes are global. This skill produces the token change and reports sync
status; it does not own validation evidence. For non-trivial routed work, build/
test validation comes from the `test-runner` agent and visual/adherence review
from `design-reviewer` (pipeline Steps 2–3). State explicitly that validation is
delegated there. A trivial direct styling change may be sanity-built locally, but
that is not a substitute for the routed validation gate.

## Output Contract

Begin with:

`Skill: design - output below`

| Status | Tokens Changed | Files (styles.css / design-book.md) | Hardcoded Values Removed | Scale Steps After |
|--------|----------------|-------------------------------------|--------------------------|-------------------|

- `Status` is `Complete` only when `styles.css` and `design-book.md` are in sync.
  Build/test validation is the `test-runner` gate's responsibility, not this
  skill's. If the two files are out of sync, report the blocker instead.
- `Scale Steps After` confirms each touched scale still has ≤ 4 steps (or names the
  justified exception).
