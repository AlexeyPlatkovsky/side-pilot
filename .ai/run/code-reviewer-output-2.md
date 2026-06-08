Let me verify a few more specific things before finalizing.
Now I have all the information needed for a thorough review. Let me compile my findings.

**Agent: code-reviewer - output below**

**Reviewed Scope** — Diff: `src-tauri/src/lib.rs`, `src-tauri/src/preferences.rs`, `src/components/Bubble.tsx`, `src/styles.css`, `vitest.setup.ts`; plus new files `src/components/GeneralSettings.tsx`, `src/i18n/translations.ts`, `src/i18n/useI18n.ts`, and `src-tauri/src/commands.rs` command handlers. Touched layers: Rust core (preferences store + IPC commands), React/TypeScript (Bubble, Settings, GeneralSettings), i18n infrastructure, CSS, Tauri capabilities. References loaded: `AGENTS.md`, `docs/architecture/README.md`, `change-hygiene.md`, `tauri-ipc-permissions.md`, `tauri-windowing.md`, `state-management.md`, `rust.md`, `frontend.md`. Validation evidence: test-runner artifact (Pass — 234 Rust + 216 frontend, build + tsc clean).

**Verdict** — Needs revision

**Findings**

### Rust Layer

| File | Line(s) | Severity | Finding | Suggested fix |
|------|---------|----------|---------|---------------|
| `src-tauri/src/preferences.rs` | 150–185 | Info | `GeneralPreferences.normalized()` normalizes only `language` but not other fields (e.g. `position_mode`, `always_on_top`, position values). Provider preferences normalizes every field. This is a minor inconsistency but not a defect — all fields that need validation are covered. | No action required; note for future pref expansion. |
| `src-tauri/src/preferences.rs` | 337–403 | Info | `update_general` duplicates the full "write temp + sync + atomic replace" logic from `update`. Both could share a helper (e.g. `atomic_write(path, &PersistedPreferences)`) returning the new file content. | Low-priority refactor opportunity. |

Rust tests: Exemplary. 15 new tests cover defaults, validation (valid/invalid languages), persistence round-trip, old-format migration, malformed-key fallback, provider/general snapshot isolation, concurrent update isolation, and all `startup_position()` mode branches. All err-assert-by-variant. No issues.

### Front-end Layer

| File | Line(s) | Severity | Finding | Suggested fix |
|------|---------|----------|---------|---------------|
| `src-tauri/capabilities/default.json` | 8–13 | **Blocking** | `core:window:allow-outer-position` is missing. `GeneralSettings.tsx:97` calls `getCurrentWindow().outerPosition()` (the Pin button), which requires this capability. A runtime permission error will block the pin-position feature. | Add `"core:window:allow-outer-position"` to the `permissions` array. |
| `src/components/Bubble.tsx` | 119–133 | **Major** | The `onMoved` event listener leaks if the component unmounts before the `getCurrentWindow().onMoved(...)` promise resolves. The cleanup function sets `cancelled = true` but does not call `unlisten()` because `unlisten` is only available inside `.then()`. If the promise hasn't resolved when the component unmounts, the listener persists on the window forever (though it no-ops due to the cancelled flag). | Store the promise and call `.then(unlisten => unlisten())` in cleanup, or use `let unlistenRef: (() => void) | null = null` and assign it inside `.then()` so cleanup can invoke it. |
| `src/components/Bubble.tsx` | 98–138 | **Major** | No test covers the `onMoved` → debounced save flow. This is non-trivial behavior (debounce timer, cancellation, position persistence via `chatApi`). The `vitest.setup.ts` mock supports testing this. | Add a test in a Bubble test file (or extend the existing one) that: registers the `onMoved` handler, fires a synthetic move event, advances the debounce timer, and asserts `updateGeneralPreferences` was called with the expected `lastKnownPosition`. |
| `src/components/Bubble.tsx` | 105–108 | Minor | `useEffect` depends on `chatApi` but the inner `savePosition` closure accesses `chatApi` directly (line 105), not the effect-scoped `api` variable (line 100). This is not a functional bug — both references resolve to the same value in practice — but it's a lint-hygiene issue: there are two different `chatApi`/`api` references in the same effect. | Consolidate: use `api` inside `savePosition` instead of `chatApi`, or remove the `api` alias and use `chatApi` consistently (early-return on `inertChatApi` already guards). |

### Change Hygiene (§1 — State-lifecycle completeness)

| Component | State | Add Paths | Removal Paths | Status |
|-----------|-------|-----------|---------------|--------|
| `GeneralSettings` | `langOpen` | Click lang button | Select lang, outside click, unmount (DOM removal) | **Pass** — the `useEffect` cleanup removes the outside-click listener, and React unmount removes local state. |
| `Bubble` | `moveTimer`, `lastSavedPos` | Window `onMoved` | Unmount cleanup clears timeout + sets `cancelled`, unlisten called (if promise resolved) | **Pass with note** — timer and ref are cleaned up on unmount. See the Major finding above about unlisten race. |
| `GeneralSettings` | `loadState` | Fetch on mount | Unmount sets `cancelled = true` | **Pass** — the fetch effect uses a cancelled flag pattern. |
| `Bubble` | `moveTimer` | Window move events | Clear timeout on unmount | **Pass** — `clearTimeout` in cleanup. |

### Change Hygiene (§3 — Adversarial input coverage)

| Surface | Adversarial classes | Coverage |
|---------|---------------------|----------|
| `GeneralPreferences.language` (Rust `normalized()`) | empty, whitespace, boundary, wrong kind | Tests cover valid (`"en"`, `"ru"`) and invalid (`"de"`, `"fr"`). No whitespace or empty-string test. However, language values originate from the UI's hard-coded `LANGUAGES` array (only `"en"` and `"ru"`), not free-text user input, so adversarial input is not practically reachable. **Pass**. |
| `Position.x/y` (Rust) | i32 boundary | Position values come from the window system API (`window.outerPosition()`), not user input. **Pass**. |

### Capabilities / Permissions

| API Call | Required Capability | Present? |
|----------|-------------------|----------|
| `getCurrentWindow().setAlwaysOnTop(checked)` | `core:window:allow-set-always-on-top` | Yes |
| `getCurrentWindow().outerPosition()` | `core:window:allow-outer-position` | **No** |
| `getCurrentWindow().onMoved(handler)` | Likely covered by `core:default` (event listen) | Probably; see note below |
| `window.set_always_on_top(...)` (Rust, lib.rs setup) | N/A (Rust-side, no IPC) | N/A |
| `window.set_position(...)` (Rust, lib.rs setup) | N/A (Rust-side, no IPC) | N/A |
| `get_general_preferences` / `update_general_preferences` commands | Autogenerated `allow-*` | Yes (lines 20–21) |

**TDD Check** — Pass with reservation. All Rust behaviors have happy-path and error-path tests. All `GeneralSettings` interactions have both happy-path and error-state tests. The `Bubble.tsx` position-tracking behavior has no test, which is a TDD gap for non-trivial logic (see Major finding above).

**Final Recommendation** — Add `core:window:allow-outer-position` to `src-tauri/capabilities/default.json`. Add a test for the Bubble `onMoved` → debounced save flow. Consider the minor `unlisten` race cleanup (store `unlisten` ref so cleanup can always deregister).
