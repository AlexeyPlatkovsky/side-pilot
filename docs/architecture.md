# Architecture — side-pilot

Cross-platform desktop (macOS + Windows) floating AI assistant. Routes user prompts to local CLI tools via a typed Rust adapter seam.

---

## Source Tree

```
side-pilot/
├── src/                          # React/TypeScript front-end
│   ├── App.tsx                   # Root — renders <Bubble> with tauriChatApi
│   ├── main.tsx                  # Vite entry point
│   ├── components/
│   │   ├── Bubble.tsx            # Floating bubble shell: collapsed dot → expanded panel
│   │   ├── ChatPanel.tsx         # Chat transcript, toolbar, composer, session management
│   │   ├── ChatHistory.tsx       # Session rail: list, rename, delete, new chat
│   │   ├── Dialog.tsx            # Accessible modal dialog (focus trap, Escape)
│   │   └── RenameDialog.tsx      # Chat rename form inside Dialog
│   ├── chat/
│   │   ├── api.ts                # ChatApi interface + Tauri IPC bridge (tauriChatApi)
│   │   ├── config.ts             # Assistant model configuration (id, label, effort)
│   │   └── history.ts            # Title generation, relative time, sorting, selection
│   ├── state/
│   │   ├── bubbleState.ts        # Bubble visual state machine (collapsed/expanded/settings)
│   │   ├── chat.ts               # Chat transcript reducer (loaded/submit/success/error)
│   │   ├── drag.ts               # Click-vs-drag discrimination threshold
│   │   └── windowResize.ts       # Tauri window resize bridge
│   └── styles.css                # All CSS (design tokens, component styles)
│
├── src-tauri/src/                # Rust/Tauri core
│   ├── main.rs                   # Binary entry point → side_pilot_lib::run()
│   ├── lib.rs                    # Tauri builder: commands, store, invoke handler
│   ├── commands.rs               # 12 IPC command handlers (typed seam)
│   ├── links.rs                  # External URL validation (http/https/mailto only)
│   ├── adapters/
│   │   ├── mod.rs                # CliAdapter trait, AssistantId enum
│   │   ├── contract.rs           # AdapterRequest, AdapterResult, Usage, PermissionMode
│   │   ├── error.rs              # AdapterError taxonomy (6 variants)
│   │   ├── registry.rs           # AdapterRegistry — routes AssistantId → CliAdapter
│   │   ├── codex.rs              # Codex CLI adapter (MVP: the only registered adapter)
│   │   ├── process.rs            # CommandRunner trait + tokio subprocess runner
│   │   ├── binary.rs             # BinaryResolver — absolute path lookup per AssistantId
│   │   ├── environment.rs        # EnvironmentProvider — login-shell env resolution
│   └── storage/
│       ├── mod.rs                # Re-exports
│       ├── model.rs              # Session, Message, NewMessage, Sender types
│       ├── store.rs              # SQLite store (rusqlite) — CRUD for sessions/messages
│       └── error.rs              # StorageError taxonomy (NotFound, Query)
│
├── docs/
│   ├── idea.md                   # Primary design specification (features, scope, intent)
│   ├── architecture.md           # This file — implemented architecture reference
│   ├── design-book.md            # Design system tokens
│   └── code-review.md            # Code review log
│
├── .claude/                      # AI governance (skills, pipelines, agents, conventions)
├── .manifesto/                   # Instruction framework
├── tauri.conf.json               # Tauri configuration
├── Cargo.toml / Cargo.lock
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## IPC Boundary (Tauri Commands)

The React front-end never calls Tauri `invoke` directly. It depends on the **`ChatApi`** interface (`src/chat/api.ts:66-88`) — an injected seam that enables unit tests with `inertChatApi` (in-memory stub, line 111).

`tauriChatApi` (line 91) maps each method to a typed `invoke` call. The Rust side registers 12 commands in `src-tauri/src/lib.rs:31-44`:

| Command | Route | Purpose |
|---|---|---|
| `run_adapter` | `commands::run_adapter` | Route prompt to CLI adapter |
| `cancel_adapter_run` | `commands::cancel_adapter_run` | Cancel in-flight subprocess |
| `create_session` | `commands::create_session` | New local session |
| `append_message` | `commands::append_message` | Persist a message |
| `read_history` | `commands::read_history` | Load session transcript |
| `list_sessions` | `commands::list_sessions` | All sessions, most-recently-updated first |
| `rename_session` | `commands::rename_session` | Update title, no reorder |
| `delete_session` | `commands::delete_session` | Session + messages cascade |
| `clear_session` | `commands::clear_session` | Delete messages + reset codex_session_id |
| `update_codex_session_id` | `commands::update_codex_session_id` | Record native Codex resume id |
| `open_external` | `commands::open_external` | Open http/https/mailto in browser |
| `app_version` | `commands::app_version` | Cargo version string |

All IPC types serialize with `#[serde(rename_all = "camelCase")]` — Rust `snake_case` fields become JS `camelCase`.

---

## React Component Tree & Data Flow

```
App
 └─ Bubble (Bubble.tsx)
     ├─ uses bubbleReducer       # collapsed / expanded / settings
     ├─ injects ChatApi           # tauriChatApi | inertChatApi
     ├─ Escape handler            # steps back one level
     ├─ click-vs-drag discriminator  # wasDragged() threshold
     └─ ChatPanel (ChatPanel.tsx)
         ├─ uses chatReducer      # messages[], status (idle|pending|error)
         ├─ uses useChat(api)     # session list, active session, pending/unread sets
         ├─ toolbar               # model label, Rename, Clear
         ├─ transcript            # Markdown-rendered messages
         ├─ composer              # textarea + Send
         ├─ ChatHistory           # session rail (aside)
         └─ Dialogs               # RenameDialog, DeleteDialog, ClearDialog
```

### State Ownership

| State | Owner | Type |
|---|---|---|
| Bubble visibility | `useReducer(bubbleReducer)` in `Bubble` | `"collapsed" \| "expanded" \| "settings"` |
| Transcript messages | `useReducer(chatReducer)` in `useChat` | `ChatMessage[]` |
| Chat status | `useReducer(chatReducer)` in `useChat` | `{ kind: "idle" \| "pending" \| "error"; message?: string }` |
| Session list | `useState` in `useChat` | `PersistedSession[]` |
| Active session id | `useState` in `useChat` | `string \| null` |
| Pending set | `useState` in `useChat` | `Set<sessionId>` |
| Unread set | `useState` in `useChat` | `Set<sessionId>` |

### Data Flow for Prompt Submission

```
User types prompt → compose() in ChatPanel
  → dispatch({ type: "submit" })   # optimistic user message, status → pending
  → api.appendMessage(user)         # persist user turn
  → generateTitle()                 # name untitled chat from first prompt
  → api.renameSession()             # persist title
  → api.runAdapter(request)         # Tauri IPC → Codex CLI (blocking)
  → api.appendMessage(assistant)    # persist reply
  → dispatch({ type: "success" })   # append reply, status → idle
  → api.updateCodexSessionId()      # save native resume id
```

Late replies (user switched chats mid-flight) land in the originating session's unread set, not the active transcript.

---

## Rust Core Layers

### Adapter Seam (`src-tauri/src/adapters/`)

```
AdapterRegistry                          # routes AssistantId → CliAdapter
  └─ CliAdapter trait                   # fn run(req, cancel) → Result<AdapterResult, AdapterError>
       └─ CodexAdapter (MVP only)        # drives `codex exec --json`
            ├─ BinaryResolver trait      # absolute path lookup → SystemBinaryResolver
            ├─ CommandRunner trait       # spawn & wait → SystemCommandRunner (tokio)
            └─ EnvironmentProvider trait # login-shell env → SystemEnvironmentProvider
```

Each adapter constructs a `CommandSpec` (program, args, cwd, env, timeout, cancel token) and hands it to the injected `CommandRunner`. The runner uses `tokio::process::Command` with:
- **Process group isolation**: Unix `process_group(0)` / Windows `CREATE_NEW_PROCESS_GROUP`
- **`tokio::select!`** biased: cancel → Timeout → Output
- **Process group termination**: SIGTERM+SIGKILL (Unix) / `taskkill /T /F` (Windows)
- **`kill_on_drop(true)`** as fallback

### Storage Layer (`src-tauri/src/storage/`)

Single `rusqlite::Connection` behind a `Mutex`, managed as Tauri state:

**Schema:**
```sql
sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  codex_session_id TEXT
);
messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  sender TEXT NOT NULL,
  assistant_id TEXT,
  content TEXT NOT NULL,
  raw_json TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (session_id, seq)
);
```

**Key behaviors:**
- `delete_session`: cascade deletes messages (`ON DELETE CASCADE`)
- `clear_session`: deletes messages + nulls `codex_session_id`; preserves session, `updated_at` unchanged
- `rename_session`: updates title; `updated_at` unchanged
- `list_sessions`: `ORDER BY updated_at DESC, id ASC`
- `append_message`: auto-assigns `seq` as `MAX(seq) + 1`

### Links Safety (`src-tauri/src/links.rs`)

Assistant Markdown may contain links. `open_external` validates the scheme before delegating to the OS opener:
- **Allowed**: `http://`, `https://` (with non-empty authority), `mailto:` (with address)
- **Rejected**: `javascript:`, `file:`, `data:`, `vbscript:`, protocol-relative, scheme-less

---

## Session Lifecycle

```
START → create_session()              # new empty session
  → append_message(user)              # persist user turn
  → rename_session()                  # title from first prompt
  → run_adapter()                     # CLI response
  → append_message(assistant)         # persist reply
  → update_codex_session_id()         # native resume id
  → [user switches to another session]
  → [reply arrives → unread flag set]
  → [user reopens → read_history()]   # load transcript
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
