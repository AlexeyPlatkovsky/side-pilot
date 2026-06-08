# Architecture — side-pilot

Cross-platform desktop (macOS + Windows) floating AI assistant. Routes user prompts to local CLI tools via a typed Rust adapter seam.

---

## File Routing

This file is the index. Read the sub-file that matches your focus area:

| If you are working with... | Read this file |
|---|---|
| React components, data flow, state management | `docs/architecture/ui.md` |
| IPC commands, Tauri capabilities, `ChatApi` bridge | `docs/architecture/ipc.md` |
| Rust core layers: adapters, CLI runners, binary resolution, links | `docs/architecture/rust.md` |
| Database storage, SQLite schema, migrations, CRUD operations | `docs/architecture/db.md` |
| Overview, source tree, implemented scope, design decisions | *(this file — `docs/architecture/README.md`)* |

---

## Source Tree

```
side-pilot/
├── src/                          # React/TypeScript front-end
│   ├── App.tsx                   # Root — renders <Bubble> with tauriChatApi
│   ├── main.tsx                  # Vite entry point
│   ├── components/
│   │   ├── Bubble.tsx            # Floating bubble shell: collapsed dot → expanded panel
│   │   ├── Settings.tsx           # Settings view: section rail + empty placeholder panes (SP-031)
│   │   ├── ChatPanel.tsx         # Chat transcript, toolbar, composer, AI switcher, route submission
│   │   ├── AiSwitcher.tsx        # Provider switcher button + vertical picker (All + GPT/Claude/Gemini)
│   │   ├── ProviderIcon.tsx      # Provider logo images + the All grid glyph
│   │   ├── ChatHistory.tsx       # Session rail: list, rename, delete, new chat
│   │   ├── Dialog.tsx            # Accessible modal dialog (focus trap, Escape)
│   │   └── RenameDialog.tsx      # Chat rename form inside Dialog
│   ├── chat/
│   │   ├── api.ts                # ChatApi interface + Tauri IPC bridge (tauriChatApi)
│   │   ├── providers.ts          # Provider registry, ActiveRoute, route + label/error helpers
│   │   └── history.ts            # Title generation, relative time, sorting, selection
│   ├── state/
│   │   ├── bubbleState.ts        # Bubble visual state machine (collapsed/expanded/settings)
│   │   ├── chat.ts               # Chat transcript reducer (loaded/submit/success/error/route*)
│   │   ├── drag.ts               # Click-vs-drag discrimination threshold
│   │   └── windowResize.ts       # Tauri window resize bridge
│   └── styles.css                # All CSS (design tokens, component styles)
│
├── src-tauri/src/                # Rust/Tauri core
│   ├── main.rs                   # Binary entry point → side_pilot_lib::run()
│   ├── lib.rs                    # Tauri builder: commands, store, invoke handler
│   ├── commands.rs               # IPC command handlers (typed seam)
│   ├── links.rs                  # External URL validation (http/https/mailto only)
│   ├── adapters/
│   │   ├── mod.rs                # CliAdapter trait, AssistantId enum
│   │   ├── contract.rs           # AdapterRequest, AdapterResult, Usage, PermissionMode
│   │   ├── error.rs              # AdapterError taxonomy (6 variants)
│   │   ├── registry.rs           # AdapterRegistry — routes AssistantId → CliAdapter
│   │   ├── codex.rs              # Codex CLI adapter (codex exec --json)
│   │   ├── claude.rs            # Claude Code CLI adapter (claude -p --output-format json)
│   │   ├── gemini.rs           # Gemini CLI adapter (gemini -o json --approval-mode plan --skip-trust)
│   │   ├── ansi.rs              # Shared defensive ANSI-escape stripper (§5)
│   │   ├── json.rs             # Shared lenient single-document JSON parser (Claude/Gemini)
│   │   ├── process.rs            # CommandRunner trait + tokio subprocess runner
│   │   ├── binary.rs             # BinaryResolver — absolute path lookup per AssistantId
│   │   └── environment.rs        # EnvironmentProvider — shell/process env resolution
│   ├── routing/
│   │   └── mod.rs                # Multi-provider route planner, transcript replay, concurrent dispatch (SP-016)
│   └── storage/
│       ├── mod.rs                # Re-exports
│       ├── model.rs              # Session, Message, NewMessage, Sender types
│       ├── store.rs              # SQLite store (rusqlite) — CRUD for sessions/messages
│       └── error.rs              # StorageError taxonomy (typed IPC failures)
│
├── docs/
│   ├── idea.md                   # Primary design specification (features, scope, intent)
│   ├── architecture/
│   │   ├── README.md             # This file — index + overview
│   │   ├── ui.md                 # React component tree, data flow, state
│   │   ├── ipc.md                # IPC boundary, commands, capabilities
│   │   ├── rust.md               # Rust core: adapters, bootstrap, links
│   │   └── db.md                 # SQLite storage, schema, migrations
│   ├── design-book.md            # Design system tokens
│   └── code-review.md            # Code review log
│
├── .ai/                      # AI governance (skills, pipelines, agents, conventions)
├── .manifesto/                   # Instruction framework
├── src-tauri/tauri.conf.json     # Tauri configuration
├── src-tauri/capabilities/       # Tauri v2 window + command permissions
├── src-tauri/permissions/        # Autogenerated command allow/deny permissions
├── src-tauri/Cargo.toml / Cargo.lock
├── package.json
├── tsconfig.json
├── vite.config.ts
├── playwright.config.ts          # WebKit/Chromium/Firefox E2E harness
├── e2e/                          # Browser-level interaction specs + fixtures
└── README.md
```

---

## Implemented Scope

The current codebase implements the MVP chat shell and Codex-only backend:

- Floating always-on-top Tauri window configured as a frameless transparent bubble.
- React bubble/panel UI with local chat sessions, history rail, rename/delete/clear, Markdown replies, pending and unread rail states.
- SQLite-backed local session/message history.
- Codex, Claude, and Gemini CLI adapters registered, running blocking read-only calls (`codex exec --json`; `claude -p --output-format json --permission-mode plan`; `gemini -o json --approval-mode plan --skip-trust`).
- Multi-provider routing core (SP-016): `run_route` dispatches a prompt to one provider or concurrently to `All`, sending each provider only the context it has not seen via app-owned transcript replay (`message_provider_sends` junction table), with per-slot partial-failure isolation and persisted display-only error rows whose visible CLI diagnostic is reduced to a useful bounded summary.
- AI switcher UI (SP-017): a provider-logo switcher beside Send opens a vertical picker (All + GPT/Claude/Gemini); the active route drives `run_route`, with each provider's reply shown as a separate labeled transcript slot (per-provider loading + inline error cards), the switcher disabled while any response is in flight.
- Settings view shell (SP-029, SP-031): a gear control in the panel header opens an in-panel settings view with a left section rail (7 sections: API Keys, CLI Integrations, Themes, General, Keyboard Shortcuts, Account, About) and empty placeholder panes; sections are populated by later features.

Deferred from the broader product specification:

- Global hotkey, tray/menu-bar entry, active-app context, selected-text capture, screenshots, voice, slash-command routing, and the `/summarize` synthesis workflow (slash commands and summarize were explicitly cut from SP-015's scope).
- User-visible cancellation control. The Rust command exists, and the request contract supports `runId`, but the current React submit flow does not pass a run id or expose a cancel button.

---

## Session Lifecycle

```
START → create_session()              # new empty session
  → append_message(user)              # persist user turn
  → rename_session()                  # title from first prompt
  → run_adapter()                     # CLI response
  → append_message(assistant)         # persist reply
  → update_codex_session_id()         # native resume id, bumps updated_at
  → [user switches to another session]
  → [reply arrives → unread flag set]
  → [user reopens → read_history()]   # load transcript
  → [provider fails → persisted error row] # visible after switching/restart, never replayed
  → [user clears → clear_session()]   # empty but preserved
  → [user deletes → delete_session()] # gone forever
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **IPC typed seam (ChatApi)** | Components testable with injected stubs; no `invoke` in component code |
| **Pure reducers (chat, bubble)** | Transcript and window-state logic unit-testable without React or Tauri |
| **Mutex<Connection>, not async SQL** | Each op is fast (<1ms); lock-and-release avoids `.await`-while-locked |
| **Process group isolation** | Timeout/cancel kill the entire tree, not just the direct child |
| **Adapter trait + registry** | New CLIs (Claude, Gemini) register without changing the command handler |
| **Shell env resolution** | GUI-launched app doesn't inherit login shell PATH |
| **Read-only MVP** | PermissionMode::ReadOnly only; write/execute modes deferred |
| **camelCase IPC** | Rust snake_case ↔ JS camelCase via serde attribute |
| **No updated_at on rename/clear** | Preserves chronological rail order; rename/clear are not new messages |
| **unread set, not per-session flag** | Survives session deletion, bulk operations, no DB schema change |
