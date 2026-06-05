# Code Review — side-pilot

Date: 2026-06-05  
Scope: Full codebase — Rust core (`src-tauri/`) + React/TypeScript frontend (`src/`)  
Reviewer: AI assistant  
All 64 Rust tests pass. ~123 Vitest tests pass. 11 E2E tests pass.

---

## Rust Core

### 1. `storage/model.rs:30` — implement `FromStr` trait instead of `from_str` method

```rust
// Current — standalone method, triggers clippy::should_implement_trait
pub fn from_str(value: &str) -> Option<Self> { ... }
```

Clippy with `-D warnings` rejects this. Replace with a proper `FromStr` impl:

```rust
impl std::str::FromStr for Sender {
    type Err = ();
    fn from_str(s: &str) -> Result<Self, Self::Err> { ... }
}
```

**Update site** `storage/store.rs:306` — change `unwrap()` to `ok()` or handle `Err`.

**Effort:** 5 min | **Impact:** blocks `-D warnings` builds

---

### 2. `storage/store.rs:74` — silent mutex poison recovery

```rust
self.conn.lock().unwrap_or_else(|e| e.into_inner())
```

If a panic occurs mid-write, the recovered guard continues with a connection in an
unknown state. A panic means a `catch_unwind` boundary was crossed — this should
log or re-open the connection instead of silently resuming.

**Effort:** 10 min | **Impact:** data safety

---

### 3. `storage/store.rs:23` — no schema migration system

`PRAGMA user_version` is mentioned in a comment but never checked. Any future
schema change will require a manual database wipe. Add a `check_version()` step
in `from_connection()` that reads `user_version` and applies migration steps
incrementally.

**Effort:** 30 min | **Impact:** maintainability (long-term)

---

### 4. `storage/store.rs:325-330` — `now_millis` silently handles pre-epoch clock

```rust
.map(|d| d.as_millis() as i64).unwrap_or(0)
```

A system clock before Unix epoch (1970) is an extreme edge case, but silent
fallback to `0` hides the problem. `expect("system clock before 1970")` would
be more honest.

**Effort:** 2 min | **Impact:** correctness

---

### 5. `commands.rs:84-92` — cancellation token leaks on dropped future

```rust
let cancel = state.register_run(run_id.clone()).await;
let result = state.registry.run(request, cancel).await;
state.finish_run(&run_id).await; // skipped if run() panics or future is dropped
```

If `run()` panics or the future is cancelled externally, `finish_run` is never
called and the `CancellationToken` leaks in `active_runs`. Use a drop guard:

```rust
struct RunGuard<'a> { state: &'a AppState, run_id: String, finished: bool }
impl Drop for RunGuard<'_> { fn drop(&mut self) { if !self.finished { ... } } }
```

**Effort:** 15 min | **Impact:** resource leak

---

### 6. `adapters/binary.rs` + `environment.rs` — identical caching pattern

Both modules follow the same shape:
- `Mutex<HashMap<AssistantId, T>>` cache
- Check → miss → call lookup → cache → return
- `with_lookup()` for test injection

Extract into a generic `Cached<K, V>` or a macro. Low priority since each is
under 70 lines.

**Effort:** 20 min | **Impact:** maintainability

---

### 7. `adapters/codex.rs:77-114` — `build_args` is a complex static method

Takes `&AdapterRequest` + `cwd: &str`. 18 tests verify every flag permutation.
Works correctly but verbose. Consider a builder pattern as the module grows to
handle Claude/Gemini args.

**Effort:** optional | **Impact:** maintainability

---

### 8. `adapters/codex.rs:294-315` — ANSI stripping is hand-rolled

`strip_ansi()` handles CSI sequences correctly but doesn't cover all ANSI edge
cases (SGR sub-parameters, OSC sequences). Consider the `strip-ansi-escapes`
crate if robustness matters more than a zero-dependency approach.

**Effort:** 5 min | **Impact:** robustness

---

## TypeScript / React

### 9. `components/Bubble.tsx:91-134` — duplicate click-vs-drag logic

The collapsed dot and the expanded panel mark have nearly identical
`onMouseDown`/`onClick` handlers duplicated inline. Extract a shared hook:

```ts
function useClickVsDrag(onClick: () => void) {
  const origin = useRef<Point | null>(null);
  return {
    onMouseDown: (e: React.MouseEvent) => { origin.current = { x: e.screenX, y: e.screenY }; },
    onClick: (e: React.MouseEvent) => {
      const o = origin.current;
      origin.current = null;
      if (o && wasDragged(o, { x: e.screenX, y: e.screenY })) return;
      onClick();
    },
  };
}
```

**Effort:** 10 min | **Impact:** maintainability

---

### 10. `components/ChatPanel.tsx:63-335` — `useChat` hook is large (273 lines)

Handles sessions, active session management, pending/unread tracking, submit,
select, new, rename, delete, clear. Suggested split:

- `useSessions(api)` → `{ sessions, refresh, newChat, renameSession, deleteSession }`
- `useChatStatus()` → `{ pendingIds, unreadIds, markPending, markUnread, clearStatus }`
- `useChat(api)` stays as orchestrator

**Effort:** 30 min | **Impact:** maintainability

---

### 11. `components/ChatPanel.tsx:80-92` — `editSet` dual ref+state pattern is surprising

```ts
const editSet = useCallback((ref, setState, mutate) => {
  const next = new Set(ref.current);
  mutate(next);
  ref.current = next;
  setState(next);
}, []);
```

Correct but opaque to a new reader. A `useSyncRefSet` abstraction or a doc
comment explaining why both ref and state are kept would help.

**Effort:** 5 min | **Impact:** readability

---

### 12. `components/ChatPanel.tsx:41-46` — `newId()` fallback may collide

```ts
return `msg-${Math.random().toString(36).slice(2)}-${Date.now()}`;
```

Non-unique if called twice in the same ms with colliding random values.
`crypto.randomUUID()` is available in all target browsers (WebKit included);
the fallback only exists for jsdom. Consider injecting an id generator.

**Effort:** 5 min | **Impact:** robustness

---

### 13. `components/Dialog.tsx:3-4` — focus-trap selector is fragile

```ts
const FOCUSABLE = 'a[href], button:not([disabled]), ...';
```

A data attribute (`data-focusable`) on each focusable element would be more
maintainable. Also the dialog does not prevent background scroll (no
`overflow: hidden` on `<body>` while open).

**Effort:** 15 min | **Impact:** UX

---

### 14. `components/ChatHistory.tsx:186-187` — `mousedown` for outside-closes-menu

```ts
document.addEventListener("mousedown", onPointerDown);
```

Using `mousedown` means pressing a button and dragging away still closes the
menu. `click` would be more forgiving but slower. Minor UX tradeoff.

**Effort:** 5 min | **Impact:** UX

---

### 15. `chat/history.ts:116` — implicit locale in `toLocaleDateString`

```ts
d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
```

Non-deterministic in tests. Accept an explicit `locale` parameter defaulting to
`undefined` so tests can inject `"en-US"`.

**Effort:** 10 min | **Impact:** test determinism

---

### 16. `chat/api.ts:18-27` — `AdapterRequest` manually mirrors Rust shape

No shared schema validation. If a Rust field is added, TypeScript won't know
until runtime. Consider `typescript-json-schema` or typed `invoke` wrappers.

**Effort:** 1 hr | **Impact:** maintainability

---

### 17. `chat/config.ts` — brand inconsistency

The UI labels the model "GPT-5.5" while the Rust layer identifies the assistant
as `AssistantId::Codex`. This is an intentional brand choice (surface-level
"GPT" vs internal "Codex"), but documented here in case it causes confusion.

**Effort:** none needed | **Impact:** documentation

---

### 18. `styles.css` — 925 lines in a single file

Approaching the threshold where a split (base tokens, components, states) would
aid navigation. No build-time CSS processing, so splitting requires manual
`@import` or multiple `<link>` tags.

**Effort:** 30 min | **Impact:** maintainability

---

### 19. Missing: ESLint / Prettier / CI

- No `.eslintrc` or eslint config
- No `.prettierrc` or prettier config
- No lint scripts in `package.json` (no `npm run lint`)
- No CI pipeline (`.github/workflows/`)
- No pre-commit hooks

Everything relies on author discipline.

**Effort:** 1 hr | **Impact:** process gap

---

## Summary — Priority Matrix

| # | File | Issue | Effort | Impact |
|---|---|---|---|---|
| 1 | `storage/model.rs:30` | `from_str` → `FromStr` trait | 5 min | blocks `-D warnings` |
| 5 | `commands.rs:84-92` | CancellationToken leak on dropped future | 15 min | resource leak |
| 2 | `storage/store.rs:74` | Silent poison recovery | 10 min | data safety |
| 4 | `storage/store.rs:325` | Silent pre-epoch clock fallback | 2 min | correctness |
| 9 | `Bubble.tsx:91-134` | Duplicate click-vs-drag handlers | 10 min | maintainability |
| 10 | `ChatPanel.tsx:63-335` | Large hook, 8 callbacks, 4 refs + 4 states | 30 min | maintainability |
| 19 | project root | No lint/format/CI tooling | 1 hr | process gap |
| 13 | `Dialog.tsx:3-4` | Fragile focus-trap + no scroll lock | 15 min | UX |
| 3 | `storage/store.rs:23` | No schema migration system | 30 min | maintainability |
