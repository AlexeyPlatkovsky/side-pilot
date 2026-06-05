# side-pilot

Cross-platform desktop floating AI assistant built with **Tauri v2 + React +
TypeScript + Rust**.

## Prerequisites

- Node.js 18+ and npm
- Rust stable with Cargo
- Platform tools for Tauri:
  - macOS: Xcode Command Line Tools
  - Windows: Microsoft C++ Build Tools and WebView2 runtime

## Install

```bash
npm install
```

## Run

Run the real desktop app:

```bash
npm run tauri dev
```

Run only the React UI in a browser:

```bash
npm run dev
```

This design-variant worktree uses Vite port `5175`; Tauri points at
`http://localhost:5175` during development.

## Test

Front-end tests:

```bash
npm run test
```

Rust core tests:

```bash
cargo nextest run --manifest-path src-tauri/Cargo.toml
```

If `cargo nextest` is missing:

```bash
cargo install cargo-nextest
```

WebKit end-to-end tests (runtime UI validation):

```bash
npm run test:e2e
```

This runs the React UI in Playwright's **WebKit** engine — the closest approximation to the WKWebView the Tauri app renders in — to catch the runtime-only UI bugs that Vitest + jsdom and Chromium previews cannot (WebKit rendering, layout sizing, scroll/pin, auto-grow, drag-region DOM contracts). It is the automated backbone of the `AGENTS.md` "Runtime UI validation" quality gate. First-time setup downloads the engine: `npx playwright install webkit`.

Scope: WebKit *engine* correctness, not a native OS window — true OS-level window dragging (vs. drag-region markup) stays a manual check in the real Tauri window (`npm run tauri dev`).

## Build

Build the front-end:

```bash
npm run build
```

Build the desktop app package:

```bash
npm run tauri build
```

## Useful Files

- `docs/idea.md` - product and architecture specification
- `docs/design-book.md` - design system reference: the spacing, radius, color,
  icon, and type tokens defined in `src/styles.css` `:root` (change values there,
  not in component rules)
- `src/styles.css` - design tokens + component styles
- `src/App.tsx` - React UI root
- `src/components/ChatPanel.tsx` - expanded-panel chat UI: a collapsible history
  rail toggle + active-chat toolbar, transcript with safe Markdown rendering
  (`react-markdown` + `remark-gfm`), blocking "thinking" state, the prompt
  composer, and the Clear-chat confirm dialog; the `useChat` hook owns the
  session list, active session, and new/rename/delete/clear flows
- `src/components/ChatHistory.tsx` - chat history rail: "New chat" control,
  compact one-line rows (title + relative update time), per-row options menu
  (rename / delete), and the rename/delete dialogs
- `src/components/Dialog.tsx` - shared modal chrome (focus trap, Escape-to-close,
  focus restore) used by the rename/delete/clear dialogs
- `src/chat/api.ts` - typed front-end seam over the Tauri chat commands
  (`run_adapter` + the session/message store); injectable for tests
- `src/chat/history.ts` - pure rail helpers: title generation and validation
  (1–40 chars, letters/digits/spaces/basic punctuation, no special symbols;
  same rule for generated and user-entered titles), relative-time formatting,
  session sorting, and post-delete selection
- `src/state/chat.ts` - pure chat reducer (transcript + idle/pending/error status)
- `src-tauri/src/lib.rs` - Tauri command and plugin setup; opens the SQLite
  history store under the app data directory on startup
- `src-tauri/src/adapters/` - CLI routing seam: the `CliAdapter` trait, typed
  request/result/error contract, binary and environment resolution, the
  `AdapterRegistry`, and the read-only Codex adapter behind the `run_adapter`
  and `cancel_adapter_run` commands
- `src-tauri/src/storage/` - local SQLite store (bundled `rusqlite`) for chat
  sessions and messages: the display/history source of truth, behind the
  `create_session`, `append_message`, `read_history`, `list_sessions`,
  `rename_session`, `delete_session` (cascade), `clear_session`, and
  `update_codex_session_id` commands. Both `rename_session` and `clear_session`
  leave `updated_at` untouched, so neither reorders the latest-message-ordered
  rail
- `src-tauri/tauri.conf.json` - Tauri app/window configuration
- `src-tauri/icons/warm-friendly-source.svg` - source icon for this warm
  friendly assistant variant
- `src/assets/app-icon_3.png` - single source for the app mark: the UI imports
  it for the collapsed bubble and panel header, and the bundled app/Dock icons
  in `src-tauri/icons/` are generated from it via `npm run tauri -- icon
  src/assets/app-icon_3.png` (macOS/Windows outputs only; remove any generated
  `ios/`/`android/` folders per the platform scope)
