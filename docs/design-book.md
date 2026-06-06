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
| `--orange` | `#c75a00` | Notable orange — distinct from coral (danger) and honey (tints); unread-answer dot (dark enough for 3:1 non-text contrast) |

### Semantic tokens

Use these in components.

| Token | Built from | Use |
|---|---|---|
| `--color-text` | `--ink` | Primary text |
| `--color-text-muted` | `--muted` | Secondary text, placeholders, labels |
| `--color-accent` | `--teal` | Accent surfaces (user message bubble) |
| `--color-on-accent` | `--cream` | Text/icons on an accent surface |
| `--color-on-accent-muted` | `--cream` 78% | Secondary text on an accent surface (currently unused — was the user-message label, removed when "You" labels were dropped) |
| `--color-danger` | `--clay` | Error text/border (chat failure banner) |
| `--color-unread` | `--orange` | Unread-answer dot in the chat list |
| `--provider-gpt` | `--teal` | AI switcher icon accent for GPT (Codex); cream monogram (5.6:1) |
| `--provider-claude` | `--clay` | AI switcher icon accent for Claude; cream monogram (6:1) |
| `--provider-gemini` | `--honey` | AI switcher icon accent for Gemini; light fill, so the monogram uses `--ink` (~9:1) |
| `--surface-panel` | warm cream 95% | Main panel background |
| `--surface-panel-soft` | warm cream 82% | Header gradient stop |
| `--surface-warm` | warm 96% | Header gradient stop |
| `--surface-raised` | white 82% | Raised cards — assistant message, composer |
| `--surface-body-top` / `--surface-body-bottom` | warm tints | Body gradient stops |
| `--surface-danger` | `--coral` 12% | Chat failure banner background |
| `--surface-scrim` | `--ink` 28% | Modal scrim behind the rename/delete/clear dialogs |
| `--border-soft` | `--clay` 16% | Default 1px border (panel, header, composer, rail divider, dialogs) |
| `--border-accent` | `--sage` 20% | Assistant message border; "New chat" button border |
| `--overlay-hover` | `--coral` 12% | Control hover background |
| `--tint-honey` | `--honey` 34% | Header radial glow; assistant Markdown code background; active chat row / rail toggle |

### Elevation

Box-shadow tokens for floating layers above the panel surface.

| Token | Value | Use |
|---|---|---|
| `--shadow-popup` | `0 6px 18px rgba(0,0,0,0.16)` | Chat-row options menu popup |
| `--shadow-dialog` | `0 12px 32px rgba(0,0,0,0.22)` | Modal dialogs (rename / delete / clear) |

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
| `--space-2` | `8px` | Small gaps (header controls, compact panel padding) |
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
| `--radius-pill` | `999px` | Fully rounded — chat-list unread dot and the in-progress spinner ring |

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

- Composer `min-height: 42px` with `4px` inset — wraps a compact one-row input and send control.
- Send button `width: 32px; height: 32px` — single-purpose icon control sizing.
- `max-width: 86%` on messages, `opacity` values, and `line-height` values.
- Chat history rail (SP-048–057): `.chat-rail` `width: 210px` (fixed, ~50% wider than the original 140px so titles and row indicators read inside the 380px expanded panel); `.chat-row__select` `height: 32px` (compact one-line rows); `.chat-row__options` `min-width: 120px` (options popup); `.dialog` `max-width: 280px` (modal width, fits the 380px window). Message bubbles use `min-width: min-content` so a narrowed panel never wraps the one-row `.message__meta` label (model + timestamp). `.chat-row__spinner` uses a `2px` ring stroke (the in-progress indicator's only literal; thicker than the default `1px` borders so the small ring reads).
- AI switcher (SP-017): `.ai-switcher__toggle` `width: 32px; height: 32px` (icon control beside Send, matches the send button); `.ai-switcher__menu` `min-width: 132px; max-height: 220px` (right-anchored picker that opens inward so it never clips the 380px panel edge); `.provider-icon` `20px` monogram chip; `.provider-icon__grid` uses sub-icon literals (`gap: 2px`, `border-radius: 1px`) for the 12px 2×2 "All" glyph — too small for the spacing/radius scales, same precedent as the spinner stroke.

If any of these starts repeating across components, promote it to a token here.

## Component families

These class groups compose the tokens above; they are not tokens themselves but
are documented so the vocabulary stays discoverable.

- **Chat history rail & dialogs (SP-048–057):** `.chat-rail` / `.chat-rail__new` / `.chat-rail__list` (collapsible left rail), `.chat-row*` (one-line title + a status slot that shows the relative time, the in-progress `.chat-row__spinner`, or the unread `.chat-row__unread` dot in `--color-unread`, plus the `⋯` options trigger + `.chat-row__options` menu), `.chat__toolbar` (rail toggle + active title + `.chat__edit` pencil/rename + Clear; the toggle carries a `.chat__rail-toggle-badge` unread dot in `--color-unread` while the rail is collapsed and a background chat has an unread answer), and `.dialog*` (shared modal chrome behind `--surface-scrim` with `--shadow-dialog`, including `.dialog__hint` — the `--color-danger` inline validation note under the rename input for an invalid title).
- **Message meta (SP-055):** `.message__meta` (single nowrap row) holds the assistant `.message__label` model badge and the `.message__time` 24h timestamp (date-prefixed when not today); user bubbles carry just `.message__time`. `.message` uses `min-width: min-content` so the meta row never wraps.

All spacing/radius/color/type go through the tokens above; the only literals are the one-offs listed in the previous section.

---

## Stylesheet organization

All styles live in a single file, [`src/styles.css`](../src/styles.css), organized
into four banner-delimited sections (a matching index sits at the top of the file):

| Section | Covers |
|---|---|
| §1 Design tokens | the `:root` palette, spacing, radius, type, and icon tokens above |
| §2 App shell | transparent window, collapsed bubble, expanded panel + header |
| §3 Transcript | messages, meta line, assistant Markdown, thinking, error banner |
| §4 History rail, toolbar & dialogs | rail, row status, options menu, modal dialogs |

**Why one file (SP-069):** the app has no CSS preprocessor and rule order is
load-bearing for the cascade. Splitting into `@import`-ed partials would add a
brittle load-order dependency and risk silent cascade drift for no runtime
benefit at the current ~950-line size. Strong in-file sectioning keeps the file
navigable without that risk. Revisit a split only if the file outgrows
comfortable navigation *and* a bundling strategy can guarantee identical rule
order (e.g. a single entry that imports partials in the section order above).

---

## Changing the system

1. Edit the token value in [`src/styles.css`](../src/styles.css) `:root`.
2. Update the matching row in this document.
3. Run the design workflow: see [`.claude/skills/design/SKILL.md`](../.claude/skills/design/SKILL.md)
   and the [`design-system` pipeline](../.claude/pipelines/design-system.md).
4. Validate visually (the change is global) and route the `design-reviewer` agent.
