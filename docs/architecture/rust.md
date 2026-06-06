# Rust Core Architecture — side-pilot

See `docs/architecture/README.md` for the source tree overview and file routing table.

---

## Adapter Seam (`src-tauri/src/adapters/`)

```
AdapterRegistry                          # routes AssistantId → CliAdapter
  └─ CliAdapter trait                   # fn run(req, cancel) → Result<AdapterResult, AdapterError>
       └─ CodexAdapter (MVP only)        # drives `codex exec --json`
            ├─ BinaryResolver trait      # absolute path lookup → SystemBinaryResolver
            ├─ CommandRunner trait       # spawn & wait → SystemCommandRunner (tokio)
            └─ EnvironmentProvider trait # shell/process env → SystemEnvironmentProvider
```

Each adapter constructs a `CommandSpec` (program, args, cwd, env, timeout, cancel token) and hands it to the injected `CommandRunner`. The runner uses `tokio::process::Command` with:
- **Process group isolation**: Unix `process_group(0)` / Windows `CREATE_NEW_PROCESS_GROUP`
- **`tokio::select!` biased**: cancel → Timeout → Output
- **Process group termination**: SIGTERM+SIGKILL (Unix) / `taskkill /T /F` (Windows)
- **`kill_on_drop(true)`** as fallback

Binary resolution is cached per assistant. On Unix/macOS it uses `/bin/zsh -lc 'command -v <tool>'`; on Windows it uses `where`. Environment resolution is also cached per assistant: Unix/macOS reads a login-shell `env`, while Windows currently uses the process environment inherited by the app.

### Adapter Source Files

| File | Role |
|---|---|
| `src-tauri/src/adapters/mod.rs` | `CliAdapter` trait, `AssistantId` enum |
| `src-tauri/src/adapters/contract.rs` | `AdapterRequest`, `AdapterResult`, `Usage`, `PermissionMode` |
| `src-tauri/src/adapters/error.rs` | `AdapterError` taxonomy (6 variants) |
| `src-tauri/src/adapters/registry.rs` | `AdapterRegistry` — routes `AssistantId` → `CliAdapter` |
| `src-tauri/src/adapters/codex.rs` | Codex CLI adapter (MVP: the only registered adapter) |
| `src-tauri/src/adapters/process.rs` | `CommandRunner` trait + tokio subprocess runner |
| `src-tauri/src/adapters/binary.rs` | `BinaryResolver` — absolute path lookup per `AssistantId` |
| `src-tauri/src/adapters/environment.rs` | `EnvironmentProvider` — shell/process env resolution |

## App Bootstrap (`src-tauri/src/lib.rs`)

`run()` builds the Tauri app, creates the per-user app data directory, opens `side-pilot.db` there, manages both `Store` and `AppState`, and registers the IPC commands. The Tauri window itself is configured in `src-tauri/tauri.conf.json` as a 64x64 frameless, transparent, always-on-top, resizable window with no taskbar entry.

## Links Safety (`src-tauri/src/links.rs`)

Assistant Markdown may contain links. `open_external` validates the scheme before delegating to the OS opener:
- **Allowed**: `http://`, `https://` (with non-empty authority), `mailto:` (with address)
- **Rejected**: `javascript:`, `file:`, `data:`, `vbscript:`, protocol-relative, scheme-less
