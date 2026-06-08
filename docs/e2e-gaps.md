# E2E Coverage Gaps

**26 tests / 100% passing.** Suite covers AI switcher, transcript races, composer layout, settings nav, and chat-rail toggle well. Listed below are missing scenarios per priority.

---

## P0 — Missing High-Impact Features

| Gap | File | What to test |
|---|---|---|
| **Collapsed bubble** | `bubble.spec.ts` (new) | Dot renders, `aria-label="Open side-pilot"`, click expands panel, `data-tauri-drag-region` on dot |
| **Clear chat dialog** | `chat-rail.spec.ts` | Click Clear → dialog appears, Cancel leaves transcript unchanged, Confirm clears messages |
| **Dialog focus trap** | `chat-rail.spec.ts` | Tab cycles through focusable elements, Shift+Tab wraps, Tab never escapes overlay |
| **GeneralSettings controls** | `settings.spec.ts` | Toggle always-on-top, switch position mode, click Pin, open/select language dropdown |
| **Residual error banner** | `chat-transcript.spec.ts` | Extend fixture to reject `listSessions`/`readHistory` → assert `conversation__error` role="alert" |
| **Retry button** | `ai-switcher.spec.ts` | Single-provider error → Retry button visible, click replaces error with pending slot |

## P1 — Notable Gaps

| Gap | File | What to test |
|---|---|---|
| New Chat button | `chat-rail.spec.ts` | Click → new session created, empty transcript, rail updated |
| Enter-key submit | `composer.spec.ts` | Fill + Enter → message appears; Shift+Enter → newline |
| Escape global handler | `bubble.spec.ts` (new) | From expanded, press Escape → collapses to dot |
| Settings keyboard nav | `settings.spec.ts` | Arrow Down/Up cycle tabs, Home/End jump, active tab focused |
| AI picker close | `ai-switcher.spec.ts` | Escape closes picker, outside click closes, focus returns to toggle |
| Delete dialog standalone | `chat-rail.spec.ts` | Open menu → Delete → Cancel (row stays), Confirm (row removed, chat switches) |
| Empty/edge rename | `chat-rail.spec.ts` | Empty input (Save disabled), max-length boundary, valid rename updates title |

## P2 — Medium

| Gap | What to test |
|---|---|
| Provider error types | `binaryNotFound`, `notAuthenticated`, `timedOut`, `cancelled`, `outputParseFailure` |
| Right-click context menu | `contextmenu` event on rail row → menu with Rename + Delete |
| GeneralSettings loading/error | Slow `getGeneralPreferences` → "loading..." text, rejection → error text |
| Single-provider submit/resolve | Select GPT → 1 thinking slot → 1 reply labeled `gpt-5.5-low` |
| Empty sessions list | Fixture with 0 sessions → app auto-creates 1, rail shows it, transcript empty |
| `aria-live="polite"` region | Verify conversation div has `aria-live="polite"` |
| Retry-fails-again | Error fixture + retry → error card reappears |

## Accessibility Gaps

- Focus trap Tab/Shift+Tab cycle in dialogs — **untested**
- `aria-labelledby` / `aria-describedby` ID references on dialogs — **unverified**
- Focus restoration on modal close — **unverified**
- `aria-current` on active chat row — **unverified**
- Tab order within panel (toolbar → transcript → composer → send) — **unchecked**

## Layout Viewport Gaps

- Only `380x520` tested; try `320x480` (min width) and `480x800` (tall)
- No cross-engine project matrix — WebKit only; add Chromium for smoke/layout

## Improvement Patterns

- 16 screenshots captured but never snapshot-asserted — consider `toMatchSnapshot()` for dialogs
- Fixture params are strings with no type safety — add interface with defaults
- Seeded fixture's mutable `sessions` array is safe per-navigation but undocumented
- No negative tests — what happens when API throws during submit / `renameSession` returns bad shape
