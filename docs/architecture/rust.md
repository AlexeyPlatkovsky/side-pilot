# Rust Core Architecture — side-pilot

See `docs/architecture/README.md` for the source tree overview and file routing table.

---

## Adapter Seam (`src-tauri/src/adapters/`)

```
AdapterRegistry                          # routes AssistantId → CliAdapter
  └─ CliAdapter trait                   # fn run(req, cancel) → Result<AdapterResult, AdapterError>
       ├─ CodexAdapter                   # drives `codex exec --json`
       ├─ ClaudeAdapter                  # drives `claude -p --output-format json --permission-mode plan`
       └─ GeminiAdapter                  # drives `gemini -o json --approval-mode plan --skip-trust -p`
            ├─ BinaryResolver trait      # absolute path lookup → SystemBinaryResolver
            ├─ CommandRunner trait       # spawn & wait → SystemCommandRunner (tokio)
            └─ EnvironmentProvider trait # shell/process env → SystemEnvironmentProvider
```

The default registry shares one `SystemBinaryResolver`, `SystemCommandRunner`, and
`SystemEnvironmentProvider` across all three adapters; the resolver and env
provider cache per `AssistantId`, so a single instance serves every registered
adapter.

Claude differs from Codex in two contract-driven ways: it takes its file-access
root from the process `cwd` (no `-C`/working-root flag), and its read-only `plan`
permission mode is passed on **every** run — including resume (`-r <id>`) — so the
conservative posture (`docs/idea.md` §4) cannot be lost across turns. `claude
--output-format json` emits a JSON **array** of events whose final `{"type":
"result",…}` element carries the assistant text, `session_id`, and `usage`; the
parser also accepts a bare result object.

Gemini has two verified divergences from the `docs/idea.md` §1 contract table
(both confirmed against gemini 0.44.1):
- The neutral/temp working directory (§3) is **untrusted**, so a headless run is
  refused (and `--approval-mode` is silently downgraded) unless `--skip-trust` is
  passed. The adapter always passes it; combined with `--approval-mode plan` the
  read-only posture (§4) is preserved — the tool still cannot edit or execute.
- `gemini -r/--resume` takes `"latest"` or an **index**, not a session UUID
  (`--session-id` *starts* a new session), so UUID-based native resume is
  unavailable. `resume_session_id` therefore does not affect command construction;
  multi-tool continuity is carried by app-owned transcript replay (§6, SP-016) and
  the native `session_id` is still captured from output as a per-tool optimization.

`gemini -o json` emits a single result object (`response`, `session_id`,
`stats.models.<name>.tokens`); token usage is summed across models onto the
shared `Usage` shape (`candidates` → output tokens, `thoughts` → reasoning).

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
| `src-tauri/src/adapters/codex.rs` | Codex CLI adapter (`codex exec --json`) |
| `src-tauri/src/adapters/claude.rs` | Claude Code CLI adapter (`claude -p --output-format json`) |
| `src-tauri/src/adapters/gemini.rs` | Gemini CLI adapter (`gemini -o json --approval-mode plan --skip-trust`) |
| `src-tauri/src/adapters/ansi.rs` | Shared defensive ANSI-escape stripper (§5) |
| `src-tauri/src/adapters/json.rs` | Shared lenient single-document JSON parser (Claude/Gemini) |
| `src-tauri/src/adapters/process.rs` | `CommandRunner` trait + tokio subprocess runner |
| `src-tauri/src/adapters/binary.rs` | `BinaryResolver` — absolute path lookup per `AssistantId` |
| `src-tauri/src/adapters/environment.rs` | `EnvironmentProvider` — shell/process env resolution |

## App Bootstrap (`src-tauri/src/lib.rs`)

`run()` builds the Tauri app, creates the per-user app data directory, opens `side-pilot.db` there, manages both `Store` and `AppState`, and registers the IPC commands. The Tauri window itself is configured in `src-tauri/tauri.conf.json` as a 64x64 frameless, transparent, always-on-top, resizable window with no taskbar entry.

## Links Safety (`src-tauri/src/links.rs`)

Assistant Markdown may contain links. `open_external` validates the scheme before delegating to the OS opener:
- **Allowed**: `http://`, `https://` (with non-empty authority), `mailto:` (with address)
- **Rejected**: `javascript:`, `file:`, `data:`, `vbscript:`, protocol-relative, scheme-less
