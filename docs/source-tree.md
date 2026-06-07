# Source Tree Reference — side-pilot

Detailed source file map for implementers. Read this when you need to
understand what each file does and where to make changes.

---

## Specification & Architecture

- `docs/idea.md` — product specification and architecture intent
- `docs/architecture/README.md` — implemented architecture reference and routing
  index for UI, IPC, Rust core, and database details
- `docs/design-book.md` — design system reference: the spacing, radius, color,
  icon, and type tokens defined in `src/styles.css` `:root` (change values there,
  not in component rules)

---

## Front-End (React/TypeScript)

### Entry & Root

- `src/styles.css` — design tokens + component styles
- `src/App.tsx` — React UI root; renders `<Bubble>` with `tauriChatApi`

### Components

- `src/components/ChatPanel.tsx` — expanded-panel chat UI: a collapsible history
  rail toggle + active-chat toolbar (title + pencil rename + Clear), transcript
  with per-message 24h timestamps and safe Markdown rendering (`react-markdown`
  with `remark-gfm`), blocking "thinking" state, the prompt composer, and the
  Clear-chat confirm dialog; assistant links are intercepted and opened in the
  OS default browser (via `open_external`) so the WebView never navigates away
  from the app; the `useChat` hook owns the session list, active session,
  per-session in-flight/unread status, and new/rename/delete/clear flows
- `src/components/ChatHistory.tsx` — chat history rail: "New chat" control,
  compact one-line rows (title + a status slot showing the relative update time,
  an in-progress spinner, or an unread-answer dot), per-row options menu
  (rename / delete), and the delete dialog
- `src/components/RenameDialog.tsx` — shared rename modal (title validation,
  1–40 chars) used by both the rail's per-row menu and the toolbar pencil
- `src/components/Dialog.tsx` — shared modal chrome (focus trap, Escape-to-close,
  focus restore) used by the rename/delete/clear dialogs

### Chat & State

- `src/chat/api.ts` — typed front-end seam over the Tauri chat commands
  (`run_adapter` + the session/message store); injectable for tests. The wire
  types come from `src/chat/generated/` (ts-rs output; see `npm run gen:bindings`)
  so the request/result/session/message shapes cannot drift from the Rust structs
- `src/chat/history.ts` — pure rail/transcript helpers: title generation and
  validation (1–40 chars, letters/digits/spaces/basic punctuation, no special
  symbols; same rule for generated and user-entered titles), relative-time
  formatting for the rail, 24h message-timestamp formatting (date-prefixed when
  not today), session sorting, and post-delete selection
- `src/state/chat.ts` — pure chat reducer (transcript + idle/pending/error status)

---

## Rust/Tauri Core

- `src-tauri/src/lib.rs` — Tauri command and plugin setup; opens the SQLite
  history store under the app data directory on startup
- `src-tauri/src/links.rs` — external-link safety: `is_safe_external_url`
  (http/https/mailto only) behind the `open_external` command, so assistant
  links open in the system browser and unsafe schemes (`javascript:`, `file:`,
  …) are rejected before reaching the OS opener
- `src-tauri/src/adapters/` — CLI routing seam: the `CliAdapter` trait, typed
  request/result/error contract, binary and environment resolution, the
  `AdapterRegistry`, and the read-only Codex adapter behind the `run_adapter`
  and `cancel_adapter_run` commands
- `src-tauri/src/storage/` — local SQLite store (bundled `rusqlite`) for chat
  sessions and messages: the display/history source of truth, behind the
  `create_session`, `append_message`, `read_history`, `list_sessions`,
  `rename_session`, `delete_session` (cascade), `clear_session`, and
  `update_codex_session_id` commands. Both `rename_session` and `clear_session`
  leave `updated_at` untouched, so neither reorders the latest-message-ordered
  rail
- `src-tauri/tauri.conf.json` — Tauri app/window configuration

---

## Icons & Assets

- `src-tauri/icons/warm-friendly-source.svg` — source icon for the warm-friendly
  assistant variant
- `src/assets/app-icon_3.png` — single source for the app mark: the UI imports
  it for the collapsed bubble and panel header, and the bundled app/Dock icons
  in `src-tauri/icons/` are generated from it with the Tauri icon command
  (`npm run tauri -- icon src/assets/app-icon_3.png`). Keep macOS/Windows
  outputs only; remove any generated `ios/`/`android/` folders per the platform
  scope
