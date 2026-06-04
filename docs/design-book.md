# Design Book — side-pilot

The centralized reference for the side-pilot visual design system. Every spacing,
radius, color, type, and icon value used in the UI is defined once as a CSS token
in [`src/styles.css`](../src/styles.css) `:root`. This document explains what each
token means and when to use it.

**Rule of thumb:** components must reference tokens, never raw values. If a value
you need does not exist as a token, add a token here and in `:root` first — do not
hardcode. Keep each scale small (3–4 steps); resist adding "just one more" value.

---

## Color

### Primitives (the warm palette)

Raw brand hues. Components should **not** reference these directly except for the
rare one-off; use the semantic tokens below. Alpha tints are derived from these
with `color-mix()`, so changing a primitive updates every tint built from it.

| Token | Value | Role |
|---|---|---|
| `--ink` | `#312522` | Darkest warm brown — primary text, send button |
| `--muted` | `#7a625b` | Muted brown — secondary text |
| `--honey` | `#f7b955` | Warm yellow accent (header glow) |
| `--coral` | `#dc6b4f` | Coral accent (hover overlay) |
| `--sage` | `#6b8f83` | Green-grey (assistant message border) |
| `--clay` | `#8a4f3f` | Red-brown (borders) |
| `--cream` | `#fffaf2` | Lightest warm tint — text on accent, body base |
| `--teal` | `#2f6f63` | Accent / focus / user message |

### Semantic tokens

Use these in components.

| Token | Built from | Use |
|---|---|---|
| `--color-text` | `--ink` | Primary text |
| `--color-text-muted` | `--muted` | Secondary text, placeholders, labels |
| `--color-accent` | `--teal` | Accent surfaces (user message bubble) |
| `--color-on-accent` | `--cream` | Text/icons on an accent surface |
| `--color-on-accent-muted` | `--cream` 78% | Secondary text on an accent surface (user-message label) |
| `--surface-panel` | warm cream 95% | Main panel background |
| `--surface-panel-soft` | warm cream 82% | Header gradient stop |
| `--surface-warm` | warm 96% | Header gradient stop |
| `--surface-raised` | white 82% | Raised cards — assistant message, composer |
| `--surface-body-top` / `--surface-body-bottom` | warm tints | Body gradient stops |
| `--border-soft` | `--clay` 16% | Default 1px border (panel, header, composer) |
| `--border-accent` | `--sage` 20% | Assistant message border |
| `--overlay-hover` | `--coral` 12% | Control hover background |
| `--tint-honey` | `--honey` 34% | Header radial glow |

### Focus ring

| Token | Value |
|---|---|
| `--focus-ring` | `--teal` |
| `--focus-ring-width` | `2px` |
| `--focus-ring-offset` | `2px` |

Apply as `outline: var(--focus-ring-width) solid var(--focus-ring); outline-offset: var(--focus-ring-offset);` on every `:focus-visible` interactive element.

---

## Spacing

A 4px base scale. Use for `gap`, `padding`, and `margin`. There are intentionally
only four steps — pick the nearest one rather than introducing an odd value.

| Token | Value | Typical use |
|---|---|---|
| `--space-1` | `4px` | Tight gaps (control row), micro-padding (composer inset) |
| `--space-2` | `8px` | Small gaps (composer items) |
| `--space-3` | `12px` | Default gap/padding (header, identity, messages, conversation) |
| `--space-4` | `16px` | Section padding/gap (panel body) |

---

## Border radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `6px` | Small controls (header buttons) |
| `--radius-md` | `8px` | Cards & inputs (messages, composer, send) |
| `--radius-lg` | `14px` | Icon / mark corners |
| `--radius-xl` | `18px` | The outer panel |

---

## Icon / mark sizes

| Token | Value | Use |
|---|---|---|
| `--icon-sm` | `22px` | Header control buttons |
| `--icon-md` | `42px` | Bubble icon + header mark (must match) |
| `--icon-lg` | `56px` | Bubble drag/hit area |

`--icon-md` deliberately governs both the collapsed bubble and the header mark so
the app reads at one consistent size across states.

---

## Type

| Token | Value | Use |
|---|---|---|
| `--font-xs` | `11px` | Uppercase labels |
| `--font-sm` | `12px` | Status text, placeholders |
| `--font-md` | `14px` | Body, title, control glyphs |
| `--font-lg` | `18px` | Back-arrow glyph |
| `--font-weight-bold` | `700` | Bold text (titles, labels, buttons) |

---

## Known one-offs

A few component-specific dimensions are intentionally left as literals because
they are not part of any repeated scale:

- Composer `min-height: 44px` — accessible minimum touch/click target.
- Send button `min-width: 58px; height: 32px` — single-purpose control sizing.
- `max-width: 86%` on messages, `opacity` values, and `line-height` values.

If any of these starts repeating across components, promote it to a token here.

---

## Changing the system

1. Edit the token value in [`src/styles.css`](../src/styles.css) `:root`.
2. Update the matching row in this document.
3. Run the design workflow: see [`.claude/skills/design/SKILL.md`](../.claude/skills/design/SKILL.md)
   and the [`design-system` pipeline](../.claude/pipelines/design-system.md).
4. Validate visually (the change is global) and route the `design-reviewer` agent.
