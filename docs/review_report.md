# side-pilot Code Review Report

**Date:** 2026-06-08 (last updated 2026-06-10)
**Scope:** Full project audit — Rust backend (25 files), TypeScript/React frontend (~50 files), configuration/build files (16 files), E2E tests (7 spec files).

---

## Executive Summary

The project demonstrates strong architectural foundations: clean layer separation, well-typed IPC contracts, a trait-based adapter pattern, and comprehensive test coverage for pure functions. Several issues were identified in the original audit; the deadlock in `preferences.rs` and its associated persistence duplication have since been fixed, and dependency auditing has been added to CI. Outstanding concerns include a **fully disabled Content Security Policy**, **unsafe type assertions** in the frontend, and ~85% duplication across the three adapter files. Below is the current prioritized issue catalog.

---

## Critical Issues

### C1. CSP Fully Disabled (`csp: null`)

**File:** `src-tauri/tauri.conf.json`

Content Security Policy is set to `null`, allowing unrestricted inline script execution. While desktop apps are less exposed than web apps, an XSS vulnerability in the Markdown rendering pipeline (`react-markdown` + `remark-gfm`) could execute arbitrary scripts.

**Fix:** Define a restrictive policy:
```json
"csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
```

### C2. Missing `engines` / `packageManager` in `package.json`

**File:** `package.json`

No pinned Node.js or npm version, leading to "works on my machine" issues.

**Fix:** Add:
```json
"engines": { "node": ">=20.0.0" },
"packageManager": "npm@11.x"
```

---

## High Severity Issues

### H1. Massive Duplication Across Three Adapter Files

**Files:** `src-tauri/src/adapters/{codex,claude,gemini}.rs`

~85% structural overlap across three files. Duplicated elements include:
- `map_runner_io_error` function (identical logic, 3 copies)
- `classify_exit` function (same structure, different auth markers)
- `resolve_cwd` method (identical, 3 copies)
- `with_neutral_cwd` test helper (identical, 3 copies)
- `new()` constructor (identical logic, 3 copies)
- `run()` method (identical control flow, 3 copies)
- Test helpers and 6-7 test scenarios each (nearly identical)

**Fix:** Extract a generic `AdapterTemplate` struct or derive macro. Shared helpers (`map_runner_io_error`, `classify_exit`, test fixtures) belong in a common module (`process.rs` or `mod.rs`).

### H2. Vitest 2.x with Vite 6.x — Version Mismatch Risk

**File:** `package.json`

`vitest ^2.1.8` was designed for Vite 5.x. `vite ^6.0.3` should pair with Vitest 3.x. This may cause silent failures.

**Fix:** Either downgrade Vite to `^5.x` or upgrade Vitest to `^3.x`.

### H3. CI Only Tests Linux — Misses macOS/Windows Validation

**File:** `.github/workflows/ci.yml`

The app targets macOS and Windows, but CI only runs on `ubuntu-latest`. This misses:
- `macOSPrivateApi` flag validation
- Windows `windows-sys` code paths
- `.icns` / `.ico` icon bundling
- `.dmg` / `.msi` bundle validation

**Fix:** Add a matrix strategy: `[ubuntu-latest, macos-latest, windows-latest]`.

### H4. Unsafe `as` Type Assertions in Frontend

**Files:**
- `src/main.tsx:6` — `as HTMLElement` on `getElementById` result (no null guard)
- `src/chat/api.ts:246` — `as { kind: string; ... }` on `unknown` error
- `src/chat/providers.ts:95` — `as AssistantId` on `string | undefined`

These bypass the type system silently. If assumptions are wrong, the app crashes at runtime or produces garbage output.

**Fix:** Use proper narrowing (early return, `instanceof` checks, discriminated union validation).

### H5. No Memoization on Message List Render

**File:** `src/components/ChatPanel.tsx:298`

`state.messages.map(...)` recreates DOM for all messages on every reducer dispatch. No `React.memo` on message rows.

**Fix:** Extract a memoized `MessageRow` component.

### H6. `.message__retry` Class Used but No CSS Rule

**File:** `src/components/ChatPanel.tsx:356` uses `className="message__retry"` but `styles.css` has no `.message__retry` rule. The Retry button is unstyled.

**Fix:** Add the CSS rule or remove the class.

---

## Medium Severity Issues

### M1. `.expect()` on Mutex Locks (8 Occurrences)

**Files:** `commands.rs:49,57,65,80`, `preferences.rs:277,284,296,300,350,354`, `cache.rs:46,50`

All use `.expect("...lock poisoned")`. A poisoned mutex aborts the operation. In `cache.rs`, this could be converted to `io::Error` for grace.

### M2. TOCTOU Race in `LookupCache::get_or_try_insert_with`

**File:** `src-tauri/src/adapters/cache.rs:46-50`

Check and insert are in separate critical sections. Under contention, the lookup closure runs more than once per key, violating the "at most one lookup" contract.

**Fix:** Hold the lock across both check and insert.

### M3. Irrefutable `let PermissionMode::ReadOnly` Pattern

**Files:** `codex.rs:95`, `claude.rs:99`, `gemini.rs:104`

The `let PermissionMode::ReadOnly = req.permission_mode;` pattern will **panic at runtime** if a new enum variant is added, instead of producing a compile error.

**Fix:** Use `match` with explicit arms and a `#[non_exhaustive]` catch-all.

### M4. `ChatPanel.tsx` Violates Single Responsibility (528 lines)

**File:** `src/components/ChatPanel.tsx`

Handles transcript rendering, toolbar, composer, retry logic, clear/rename dialogs, auto-scroll, keyboard shortcuts, and draft state.

**Fix:** Extract `ConversationTranscript`, `Composer`, `Toolbar`, `ClearDialog` subcomponents.

### M5. `useChat` Hook Too Large (441 lines)

**File:** `src/chat/useChat.ts`

Orchestrates initial load, submit, session selection, cancellation guards, rename, delete, clear, retry. The `submit` callback alone is 108 lines.

**Fix:** Extract routing logic and session lifecycle into separate hooks or a service object.

### M6. Direct Mutation of Ref-Held Objects

**File:** `src/chat/useChat.ts:197` — `session.title = updated.title;`

Mutates the object stored in `activeRef.current` directly rather than following immutable patterns. This can cause stale reads.

**Fix:** Create a new object and assign it to `activeRef.current`.

### M7. Silent Error Swallowing

**Files:**
- `src/components/Bubble.tsx:63,65,78` — `.catch(() => {})` on CLI-integration update, preference load, and position tracking
- Multiple Rust test cleanup: `.ok()` silently discards cleanup failures

**Fix:** Log errors, surface minimal feedback to user, or at minimum `console.error`.

### M8. Duplicated `useOutsideClick` and `useEscape` Patterns

Three implementations of outside-click handling and four implementations of Escape handling across `AiSwitcher`, `ChatHistory`, `GeneralSettings`, `Bubble`, and `Dialog`.

**Fix:** Extract shared hooks: `useOutsideClick(ref, callback, enabled?)` and `useEscape(callback, enabled?)`.

### M9. Irrefutable `millis_since_epoch` Panic

**File:** `src-tauri/src/storage/store.rs:585`

Panics if system clock is before Unix epoch. Unlikely on desktop but a panic in the storage layer can corrupt connection state.

**Fix:** Return `Result<i64, StorageError>` instead of panicking.

---

## Low Severity Issues

### L1. Adapter Cache Race — SIGKILL After Process Exit

**File:** `src-tauri/src/adapters/process.rs:309`

The 100ms sleep between SIGTERM and SIGKILL creates a race: if the process exits quickly, SIGKILL hits a recycled PID/process group.

**Fix:** Check if process group still exists before SIGKILL with `libc::kill(pgid, 0)`.

### L2. `summarize_cli_stderr` Overly Dense Pipeline

**File:** `src-tauri/src/routing/mod.rs:185-207`

A single 20-line chain of `.lines().map().rfind().map().map()` is hard to debug.

### L3. `make_cancel` Misleading Parameter Name

**File:** `src-tauri/src/routing/mod.rs:160,264`

`CancellationToken` named `make_cancel` suggests an action, not a signal.

### L4. `retryResult` Duplicates Logic from `execute_route_with_preferences`

**File:** `src-tauri/src/routing/mod.rs:330-387,434-470`

Success/error persistence branches are structurally identical.

### L5. Untested Tauri Commands

11 of 21 commands have no direct test (deserialization + state injection layer). All delegate to tested `Store` methods, so risk is low.

### L6. `describeError` Only Tests 1 of 12+ Error Types

**File:** `src/chat/api.test.ts`

Only `nonZeroExit` is tested. Other branches (`binaryNotFound`, `notAuthenticated`, `timedOut`, `cancelled`, `outputParseFailure`, `notFound`, `query`, `storageUnavailable`, `unsupportedSchemaVersion`, plain Error, plain string, unknown object) are untested.

### L7. `toChatMessage` Has No Unit Tests

**File:** `src/chat/api.ts:201-221`

The mapping function that transforms persisted rows into UI transcript shape is untested.

### L8. `retryReplace` Reducer Action Not Tested

**File:** `src/state/chat.ts:129-136` — the `retryReplace` action has no test case in `src/state/chat.test.ts`.

### L9. `useCallback` on Trivial Functions

**Files:** `useSessionList.ts:39`, `useChatStatus.ts:77` — `useCallback` wrapping functions that only access refs.

### L10. Barrel File `src/i18n/index.ts` Is Unused

Components import directly from `./useI18n` rather than through the barrel.

### L11. `Date.now()` Recalculated on Every Render

**File:** `src/components/ChatPanel.tsx:106` — `now = Date.now()` in render body forces all timestamp-relative formatting to recompute on every render.

### L12. Magic String ID Prefixes Not Centralized

**File:** `src/chat/useChat.ts` — `"msg-"`, `"pending-"`, `"error-"`, `"pending-retry-"`, `"error-retry-"` prefixes are repeated inline.

### L13. `z-index` Values Not Centralized

Values 2, 5, 10 used without a documented stacking-order scale.

### L14. Missing `prefers-reduced-motion` Wrapping

**File:** `src/styles.css:166` — `.bubble__dot:active` transform not wrapped.

### L15. No `.editorconfig` File

The project lacks an `.editorconfig` for consistent editor settings across contributors.

### L16. Format Script Uses Explicit File List

**File:** `package.json` — Format scripts list individual files. Adding new directories requires editing the script.

### L17. `e2e` Included in Main `tsconfig.json`

E2E tests use Playwright/Node APIs incompatible with browser DOM types.

### L18. `browserGlobals` Manually Maintained in ESLint Config

**File:** `eslint.config.js` — 20+ entries re-declaring globals already understood by ESLint.

### L19. Command List Duplicated in `build.rs` and `capabilities/default.json`

22 commands must be kept in sync manually across two files.

### L20. Windows Touch Events Not Handled

**File:** `src/components/Bubble.tsx:162-163` — `onMouseDown`/`onClick` split doesn't handle `onTouchStart`/`onTouchEnd`, which is important for Windows touchscreen laptops.

---

## Architecture & Design Observations

### Strengths
- **Clean layer separation:** Rust core (`adapters/`, `storage/`, `routing/`) → typed IPC seam (`chat/api.ts`) → React UI
- **Trait-based adapter pattern** (`CliAdapter`, `BinaryResolver`, `CommandRunner`, `EnvironmentProvider`) with `mockall` for testability
- **Discriminated union state machines** for chat reducer and bubble reducer
- **Dependency injection** for `ChatApi` enabling isolated component tests
- **Well-documented codebase** with module-level doc comments referencing design specs
- **Comprehensive unit tests** for pure functions (reducers, history helpers, providers)
- **Ref + state mirror pattern** well-documented for avoiding stale closures
- **SQLite bundled in-tree** (`rusqlite` bundled feature) — correct for cross-platform

### Weaknesses
- **Three near-identical adapter implementations** instead of a generic template
- **`ChatPanel` and `useChat`** are too large and handle too many concerns
- **No structured logging or tracing** (`tracing` crate)
- **No sentry/crash reporting** for production
- **`winperf_counters`-style issue:** the `withGlobalTauri: true` flag and `csp: null` together create a meaningful XSS attack surface

---

## Testing Gaps

| Gap | File(s) | Severity |
|-----|---------|----------|
| `describeError` — 1/12+ branches tested | `api.test.ts` | Medium |
| `toChatMessage` — no unit tests | `api.ts` | Medium |
| `retryReplace` reducer action — not tested | `chat.test.ts` | Medium |
| 11 Tauri commands — no IPC-level tests | `commands.rs` | Low |
| No integration test for language switching | missing | Low |
| No drag-and-drop E2E test | `e2e/` | Low |
| `Dialog`, `ProviderIcon`, `RenameDialog` — no dedicated tests | `components/` | Low |
| No `ResizeObserver` mock for jsdom | `vitest.setup.ts` | Low |

---

## Configuration & Build Issues Summary

| Issue | File | Severity |
|-------|------|----------|
| No `engines` / `packageManager` | `package.json` | Critical |
| `csp: null` — fully disabled | `tauri.conf.json` | High |
| Vitest 2.x + Vite 6.x mismatch | `package.json` | High |
| CI only on Linux | `.github/workflows/ci.yml` | High |
| Prettier lacks explicit options | `.prettierrc.json` | Medium |
| `e2e` in main tsconfig | `tsconfig.json` | Medium |
| No production build optimization | `vite.config.ts` | Medium |
| No pre-commit hooks | missing | Low |
| No `.editorconfig` | missing | Low |

---

## Top 9 Recommendations (Priority Order)

1. **Enable Content Security Policy** — Define a restrictive CSP in `tauri.conf.json`.
2. **Extract shared adapter logic** — Eliminate ~85% duplication between `codex.rs`, `claude.rs`, `gemini.rs`.
3. **Fix unsafe `as` casts in frontend** — `main.tsx:6`, `api.ts:246`, `providers.ts:95`.
4. **Upgrade/downgrade Vitest or Vite** — Resolve version mismatch.
5. **Add macOS/Windows CI matrix** — Validate platform-specific code paths.
6. **Decompose `ChatPanel.tsx` and `useChat.ts`** — Extract subcomponents and smaller hooks.
7. **Replace irrefutable `let` patterns with `match`** — `PermissionMode::ReadOnly` in three adapters.
8. **Fix `LookupCache` TOCTOU race** — Hold lock across check and insert.
9. **Extract shared `useOutsideClick` and `useEscape` hooks** — Eliminate 3+ duplicate implementations.

---

## Rust Issues Quick Reference

| File | Line(s) | Issue | Severity |
|------|---------|-------|----------|
| `codex/claude/gemini.rs` | passim | ~85% structural overlap (3 files) | High |
| `cache.rs` | 46-50 | TOCTOU race in `get_or_try_insert_with` | Medium |
| `codex/claude/gemini.rs` | 95/99/104 | Irrefutable `let` pattern on enum | Medium |
| `commands.rs`, `preferences.rs`, `cache.rs` | multiple | 8× `.expect()` on mutex locks | Medium |
| `store.rs` | 583 | `millis_since_epoch` panics on pre-epoch clock | Low |
| `process.rs` | 309 | SIGKILL race after fast process exit | Low |
| `routing/mod.rs` | 185-207 | Overly dense pipeline | Low |
| `routing/mod.rs` | 330-387, 434-470 | `retry_result` duplicates logic | Low |

## Frontend Issues Quick Reference

| File | Line(s) | Issue | Severity |
|------|---------|-------|----------|
| `main.tsx` | 6 | Unsafe `as` cast on `getElementById` | High |
| `api.ts` | 246 | Unsafe `as` cast on `unknown` error | High |
| `providers.ts` | 95 | Unsafe `as` cast on `string \| undefined` | High |
| `ChatPanel.tsx` | 298 | No memoization on message list | High |
| `ChatPanel.tsx` | 528 lines | Component too large (SRP violation) | Medium |
| `useChat.ts` | 201, 368 | Direct mutation of ref-held object | Medium |
| `Bubble.tsx` | 63, 65, 78 | Silent error swallowing | Medium |
| Multiple files | — | 3× `useOutsideClick`, 4× `useEscape` | Medium |
| `api.test.ts` | — | Only 1/12+ error types tested | Low |
| `api.ts` | 201-221 | `toChatMessage` untested | Low |
| `chat.test.ts` | — | `retryReplace` not tested | Low |
| `ChatPanel.tsx` | 106 | `Date.now()` on every render | Low |
| `useChat.ts` | 172, 225, 383 | Magic string prefixes | Low |
| `i18n/index.ts` | — | Unused barrel file | Low |

---

*Report generated by automated code review. No production code was changed. Updated 2026-06-10: removed C1 (deadlock fixed), H2 (persistence duplication fixed), M9 (dependency auditing added to CI); updated line numbers and file sizes.*
