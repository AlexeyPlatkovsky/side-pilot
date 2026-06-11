# Rust Core Architecture — side-pilot

See `docs/architecture/README.md` for the source tree overview and file routing table.

---

## Adapter Seam (`src-tauri/src/adapters/`)

```
AdapterRegistry                          # built-ins keyed by AssistantId; one shared custom slot
  └─ CliAdapter trait                   # fn run(req, cancel) → Result<AdapterResult, AdapterError>
       ├─ CodexAdapter                   # drives `codex exec --json`
       ├─ ClaudeAdapter                  # drives `claude -p --output-format json --permission-mode plan`
       ├─ GeminiAdapter                  # drives `gemini -o json --approval-mode plan --skip-trust -p`
       │    ├─ BinaryResolver trait      # absolute path lookup → SystemBinaryResolver
       │    ├─ CommandRunner trait       # spawn & wait → SystemCommandRunner (tokio)
       │    └─ EnvironmentProvider trait # shell/process env → SystemEnvironmentProvider
       └─ CustomCliAdapter (SP-072)      # any AssistantId::Custom → login-shell, prompt on stdin, plain stdout
```

The default registry shares one `SystemBinaryResolver`, `SystemCommandRunner`, and
`SystemEnvironmentProvider` across all three built-in adapters; the resolver and env
provider cache per `AssistantId`, so a single instance serves every registered
adapter.

### `AssistantId::Custom` and custom CLIs (SP-072)

`AssistantId` is `Codex | Claude | Gemini | Custom(String)` (the custom variant
owns a display name, so the enum is `Clone`, not `Copy`). Its wire form is the
bare string `"codex"`/`"claude"`/`"gemini"` for built-ins and `{ "custom": "<name>" }`
for a custom CLI; `as_str()`/`FromStr` use the namespaced key `custom:<name>` for
DB/run-id identity (so it can never collide with a built-in). The registry routes
every `Custom(_)` to a single shared `CustomCliAdapter`, which is not resolved
through `BinaryResolver`: it runs the user's "CLI Prompt Command" through a login
shell (`/bin/zsh -lc`, Windows `cmd /C`), writes the prompt to **stdin**, and
treats plain **stdout** as the reply (no output cap, fixed 30 s timeout). The
resolved command travels in `AdapterRequest::custom_command`, populated by
`commands.rs` from the persisted `CustomCliEntry` list — so the registry needs no
handle to the preferences store. `CustomCliEntry { name, command, enabled,
detected_status }` is stored on `CliIntegrations.custom` (serde `default` = empty,
so pre-SP-072 `preferences.json` still loads).

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
- `gemini --resume <id>` resumes a previous session **by its UUID** (verified
  gemini 0.45.2: it remembers prior turns and keeps the same `session_id`), even
  though `--help` only documents `"latest"`/index. The adapter wires
  `resume_session_id` into `--resume` like Claude/Codex (§6). On builds that
  predate UUID resume (≤0.44.1) continuity degrades gracefully to app-owned
  transcript replay, since the per-provider diff is always sent.

`gemini -o json` emits a single result object (`response`, `session_id`,
`stats.models.<name>.tokens`); token usage is summed across models onto the
shared `Usage` shape (`candidates` → output tokens, `thoughts` → reasoning).

Provider model/reasoning configuration is global and owned by the Rust
`PreferencesStore` in `src-tauri/src/preferences.rs`. At startup it loads
`preferences.json` from the app-data directory into memory. Missing or malformed
files use the Rust defaults (`gpt-5.5`/`low`, `haiku`/`low`,
`gemini-3-flash-preview`/`none`); valid partial files preserve valid providers
and independently default missing or invalid providers. Each route snapshots
all targeted provider preferences before dispatch. Codex and Claude receive
the configured model and any non-empty reasoning value except exact `none`;
Gemini receives its configured model and never receives reasoning.

`get_provider_preferences` and `update_provider_preferences` are the provider
settings seam; `get_general_preferences` and `update_general_preferences` are the
general settings seam (SP-037). General preferences store always-on-top, window
position mode (`pin` / `trackLast`), pinned position, last-known position, and
language (`en` / `ru`). Both provider and general preferences share the same
atomic file-backed store and are persisted together. Updates validate models,
atomically replace the app-data file, and refresh the in-memory snapshot
immediately. Manual file edits require an app restart.

## CLI Detection (`src-tauri/src/cli_integrations.rs`)

`CliDetector` (SP-038) checks each provider's binary presence and authentication
status. Detection runs concurrently at app start and on manual re-check from the
CLI Integrations settings pane. The detector reuses `BinaryResolver` for PATH
lookups; auth checks (`codex login status`, `claude auth status`) are run through
a login shell (`/bin/zsh -lc` on macOS, `cmd /C` on Windows) with a 10 s timeout
per CLI. Gemini is checked for binary presence only — no fast auth check exists.

Each detection call is dispatched via `tokio::task::spawn_blocking` so the three
providers are checked concurrently without blocking the async runtime.

Status outcomes: `Available` (binary found + auth confirmed), `NotInstalled`
(binary not on PATH), `NotAuthenticated` (binary found but not logged in),
`NotDetected` (detection command failed, timed out, or returned unparseable
output).

Codex auth parsing (`parse_codex_auth`) tries structured JSON first on stdout (`{"loggedIn": bool}`) for
forward compatibility, then falls back to case-insensitive text substring matching on the combined
stdout + stderr output. The combined-stream approach is required because `codex login status` writes
its status line (e.g. `"Logged in using ChatGPT"`) to **stderr** with an empty stdout. Negative
patterns are checked before positive ones (`"not logged in"` before `"logged in"`) to prevent
false-positive `Available` results from substrings embedded in error phrases.

Detection results update the in-memory `CliIntegrations` snapshot in
`PreferencesStore`; enable/disable toggles persist alongside provider and general
preferences in `preferences.json`.

### Route Planning and `active_providers`

`plan_targets(route, active_providers)` in `routing/mod.rs` converts a client-supplied
`Route` into the concrete list of `AssistantId` targets. For `Route::All` it deduplicates
and preserves insertion order from `active_providers`. For `Route::Single { provider }` it
also respects `active_providers`: if the list is non-empty and does not contain `provider`,
`plan_targets` returns an empty list so that a provider the user has disabled is never
dispatched — even when the client explicitly names it. An empty `active_providers` bypasses
the filter (legacy call sites, tests).

The route path resumes each provider's own native CLI session across turns
(SP-011). Before dispatch it reads the `native_session_id` previously recorded
for `(session, provider)` (`provider_sessions`, see `db.md`) and passes it as
`resume_session_id`; after a successful turn it persists the id the adapter
returned (latest wins). A provider therefore remembers its prior turns natively
and is replayed only its per-provider diff (the messages it has not yet seen).
All three adapters resume by UUID — Claude (`-r <id>`), Codex
(`codex exec resume <id>`), and Gemini (`--resume <id>`, verified gemini 0.45.2;
older Gemini builds ≤0.44.1 would reject a UUID). Failed slots persist no native
id, so a retry runs fresh; a provider that returns no id relies on app-owned
transcript replay (the per-provider diff is always sent).

Each adapter constructs a `CommandSpec` (program, args, cwd, env, timeout, cancel token) and hands it to the injected `CommandRunner`. The runner uses `tokio::process::Command` with:
- **Process group isolation**: Unix `process_group(0)` / Windows `CREATE_NEW_PROCESS_GROUP`
- **`tokio::select!` biased**: cancel → Timeout → Output
- **Process group termination**: SIGTERM+SIGKILL (Unix) / `taskkill /T /F` (Windows)
- **`kill_on_drop(true)`** as fallback

Routing persists provider failures as display-only error rows. For a non-zero
CLI exit, the visible message selects a useful terminal error, removes stack
trace/report/structured-dump noise, normalizes whitespace, and caps the detail
at 240 characters. The typed `AdapterError` stored in `raw_json` retains the
original diagnostic for internal troubleshooting.

When a provider fails, the diff messages are marked as sent to that provider so
retries do not compound — each retry replays only the new prompt. The
`retry_route` IPC command deletes the old error row, dispatches a fresh adapter
run, and persists the outcome (success or new error).

Binary resolution is cached per assistant. On Unix/macOS it uses `/bin/zsh -lc 'command -v <tool>'`; on Windows it uses `where`. Environment resolution is also cached per assistant: Unix/macOS reads a login-shell `env`, while Windows currently uses the process environment inherited by the app.

### Adapter Source Files

| File | Role |
|---|---|
| `src-tauri/src/adapters/mod.rs` | `CliAdapter` trait, `AssistantId` enum (incl. `Custom(String)`, SP-072) |
| `src-tauri/src/adapters/custom.rs` | `CustomCliAdapter` + `run_custom_command` — login-shell, stdin prompt, plain stdout, 30 s (SP-072) |
| `src-tauri/src/adapters/contract.rs` | `AdapterRequest`, `AdapterResult`, `Usage`, `PermissionMode` |
| `src-tauri/src/adapters/error.rs` | `AdapterError` taxonomy (6 variants) |
| `src-tauri/src/adapters/registry.rs` | `AdapterRegistry` — built-ins by `AssistantId`; any `Custom(_)` → the shared `CustomCliAdapter` slot (SP-072) |
| `src-tauri/src/adapters/codex.rs` | Codex CLI adapter (`codex exec --json`) |
| `src-tauri/src/adapters/claude.rs` | Claude Code CLI adapter (`claude -p --output-format json`) |
| `src-tauri/src/adapters/gemini.rs` | Gemini CLI adapter (`gemini -o json --approval-mode plan --skip-trust`) |
| `src-tauri/src/adapters/shared.rs` | `AdapterBase` (resolver/runner/env/cwd fields + `resolve_cwd`, `dispatch`) and `map_runner_io_error` — shared by all three adapter impls |
| `src-tauri/src/adapters/ansi.rs` | Shared defensive ANSI-escape stripper (§5) |
| `src-tauri/src/adapters/json.rs` | Shared lenient single-document JSON parser (Claude/Gemini) |
| `src-tauri/src/adapters/process.rs` | `CommandRunner` trait + tokio subprocess runner |
| `src-tauri/src/adapters/binary.rs` | `BinaryResolver` — absolute path lookup per `AssistantId` |
| `src-tauri/src/adapters/environment.rs` | `EnvironmentProvider` — shell/process env resolution |

## App Bootstrap (`src-tauri/src/lib.rs`)

`run()` builds the Tauri app, creates the per-user app data directory, opens
`side-pilot.db` and `preferences.json` there, manages `Store`,
`PreferencesStore`, and `AppState`, and registers the IPC commands. At boot,
it reads general preferences and applies `always_on_top` and window position
(from `pinned_position` or `last_known_position`, depending on mode) before
the window becomes visible (SP-037). The Tauri window itself is configured in
`src-tauri/tauri.conf.json` as a 64x64 frameless, transparent,
always-on-top, resizable window with no taskbar entry.

## Links Safety (`src-tauri/src/links.rs`)

Assistant Markdown may contain links. `open_external` validates the scheme before delegating to the OS opener:
- **Allowed**: `http://`, `https://` (with non-empty authority), `mailto:` (with address)
- **Rejected**: `javascript:`, `file:`, `data:`, `vbscript:`, protocol-relative, scheme-less
