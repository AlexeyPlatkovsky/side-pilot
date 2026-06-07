# Idea: Desktop Floating Multi-AI Assistant

## Concept

Create a cross-platform desktop (macOS + Windows) floating assistant app that provides one unified chat interface for working with multiple AI tools through their local CLI utilities. Built with Tauri + React + TypeScript.

The app should work as a small always-available desktop widget: a draggable floating button or bubble that stays above other windows. When clicked or triggered by a global hotkey, it expands into a chat panel. The user can send messages to one selected AI assistant or route the same message to multiple assistants.

The main goal is to create a personal AI control panel for daily work, not an IDE extension and not a browser-based chat.

## Core Use Case

The user can open the assistant from anywhere on the desktop (macOS or Windows), for example while working in VS Code, a browser, notes, documentation, or terminal.

Example flow:

1. The user presses a global hotkey.
2. The floating assistant opens above the current active window.
3. The app detects the active application, for example VS Code.
4. The user writes a prompt in the chat.
5. The user selects a target AI:
   - Codex
   - Claude
   - Gemini
   - All
6. The app calls the corresponding local CLI utility.
7. The response is displayed inside the same unified chat.
8. The app stores the conversation history locally.

## Main Technologies

### Platform

- macOS and Windows (cross-platform; committed to both)

### Main Application Stack

- Tauri (Rust core) — application shell, windowing, OS integration, subprocess execution
- React + TypeScript — chat UI and front-end logic
- Vite — front-end build/dev tooling
- Rust — Tauri commands, per-OS native shims (Accessibility / UI Automation, panel behavior)

Rationale: the app must ship on macOS **and** Windows from one codebase, while staying a lightweight always-on widget. Tauri uses each OS's system WebView (WKWebView on macOS, WebView2 on Windows) instead of bundling a browser, so it is far lighter than Electron. The deep-OS features (selected-text capture, non-activating floating panel) are per-OS native work in any stack; Tauri lets us share everything else (UI, routing, subprocess, storage) and drop to Rust + `objc2` / `windows` crates only for those shims. See "Why Tauri" below.

### Local AI Integration

The app should call local CLI tools installed and authenticated on the user's machine:

- OpenAI Codex CLI
- Claude Code CLI
- Gemini CLI

The app should not rely on API keys for the first version. It should use already configured CLI tools.

### Local Storage

- SQLite for structured chat history, sessions, routing metadata, and settings — accessed from Rust via `tauri-plugin-sql` (or `rusqlite`/`sqlx`)

### OS Integration

Most integration is handled by Tauri's cross-platform APIs/plugins; the deep features need per-OS native Rust shims.

Cross-platform via Tauri (one codebase, both OSes):

- Subprocess execution — Tauri/Rust `Command` (`std::process::Command` / `tauri-plugin-shell`) to run local CLIs
- Floating always-on-top window — Tauri window (`alwaysOnTop`, `decorations:false`, `transparent`)
- Global hotkey — `tauri-plugin-global-shortcut`
- Tray / menu-bar icon — Tauri tray API
- Clipboard — `tauri-plugin-clipboard-manager`

Per-OS native (Rust) shims, post-MVP:

- Active/frontmost app + window title — macOS `NSWorkspace` / Windows UI Automation
- Selected text & UI context — macOS Accessibility (`AXUIElement`) / Windows UI Automation
- Non-activating floating panel (type without stealing focus) — macOS `NSPanel` (`nonactivatingPanel`) / Windows `WS_EX_NOACTIVATE`
- Screenshots / screen capture — macOS ScreenCaptureKit / Windows capture APIs
- Voice — text-to-speech and speech-to-text via per-OS native or cloud services

## UI Concept

The app starts as a small floating bubble.

Behavior:

- Always on top
- Draggable
- Click to expand
- Click again or press Escape to collapse
- Global hotkey to open/close
- Optional menu bar icon

Expanded chat panel:

- Message input
- Model selector
- Slash-command support
- Conversation history
- Response area
- Optional split-view for comparing multiple AI responses

**Brand vs. tool:** the user-facing assistant is presented as **ChatGPT** ("GPT" in the UI), even though the MVP is powered by the OpenAI **Codex CLI**. Each assistant reply is badged with the model and reasoning effort it ran with (e.g. "GPT-5.5-medium"). Code identifiers, the `codex` binary/commands, and `codex_session_id` keep the Codex name.

## Slash Commands

Possible command format:

```text
/codex Explain this code
/claude Review this idea
/gemini Suggest alternatives
/all Compare possible solutions
/summarize Create a final recommendation from all answers
```

## AI Routing

The app should have a routing layer that maps user commands to CLI adapters.

Example adapters:

```text
CodexAdapter
ClaudeAdapter
GeminiAdapter
```

Each adapter should handle:

```text
- command construction
- process execution
- stdout/stderr parsing
- error handling
- timeout handling
- session metadata
```

The app should not assume that all CLI tools handle sessions in the same way. Instead, the app should keep its own local chat history and pass relevant context to each tool when needed.

## CLI Invocation Contract

This section is the authoritative contract for *how* adapters drive each CLI. It exists because driving the CLIs is the highest-risk part of the project: each tool is an interactive REPL by default, and the naive "spawn and screen-scrape stdout" approach is fragile. The contract removes that risk by mandating each tool's **non-interactive structured-output mode**.

**MVP decisions (confirmed in design discussion).** The first build is a **read-only, single-CLI (OpenAI Codex) chat**: read-only permission posture (§4), blocking output (§5), **Codex native session resume** for conversation continuity (§6), and **no project/file working directory** (§3). Sections below marked **[CONFIRMED]** reflect those decisions; remaining **[DECISION — proposed]** items apply to the later multi-tool phase.

### 1. Invocation mode (verified against installed CLIs)

Every adapter MUST use the tool's non-interactive mode with machine-readable output. Adapters parse structured JSON, not terminal text.

| Tool | Non-interactive command | Structured output | Working dir | Model flag | Permission flag | Native session |
|---|---|---|---|---|---|---|
| Claude Code | `claude -p "<prompt>"` | `--output-format json` (or `stream-json`) | inherits process `cwd`; `--add-dir <dir>` to widen | `--model <id>` | `--permission-mode <mode>` | `--session-id <uuid>`, resume `-r <id>` |
| OpenAI Codex | `codex exec "<prompt>"` (prompt may come via stdin) | `--json` (JSONL events); `--output-last-message <file>` for final text | `-C/--cd <dir>` | `-m/--model <id>` | `-s/--sandbox <mode>` | `codex exec resume` |
| Gemini | `gemini -p "<prompt>"` (stdin appended) | `-o/--output-format json` (or `stream-json`) | inherits process `cwd`; `--include-directories <dirs>` | `-m/--model <id>` | `--approval-mode <mode>` (+ `--skip-trust`, see note) | resume `--resume <uuid>` (verified 0.45.2; `--help` only documents `latest`/index) |

> **Verified CLI constraints (GeminiAdapter / SP-014):**
> - A headless run in an **untrusted** directory (the neutral app-controlled `cwd`, §3) is refused and `--approval-mode` is silently downgraded (gemini 0.44.1). The adapter always passes **`--skip-trust`**, which restores trust for the read-only session; combined with `--approval-mode plan` the read-only posture (§4) is preserved (the tool still cannot edit or execute).
> - `gemini --resume <id>` resumes a previous session **by its UUID** (verified gemini 0.45.2: a resumed run remembers prior turns and keeps the same `session_id`), even though `--help` documents only `"latest"`/index. The adapter wires `resume_session_id` into `--resume` like Claude/Codex (§6), targeting gemini 0.45.2+; older builds (≤0.44.1) only accept `"latest"`/index and would reject a UUID. The per-provider diff is always composed regardless, so context is carried independently of native resume.

### 2. Binary resolution and environment

A GUI app does **not** inherit the user's shell `PATH`/environment (on macOS when launched from Finder; on Windows the GUI process env differs from an interactive shell). Adapters MUST NOT rely on `PATH` lookup of `claude`/`codex`/`gemini`. Required behavior:

- Resolve each tool to an **absolute binary path**, discovered once and cached for the app process — via a login shell on macOS (`/bin/zsh -lc 'command -v codex'`), via `where`/registry/known install locations on Windows, or a user-configured override.
- Spawn each subprocess (Rust `std::process::Command` / `tauri-plugin-shell`) with an environment that lets the tools find their own config and credentials (login-shell-derived env on macOS, cached for the app process), not the bare GUI environment.
- Surface a clear "CLI not found / not authenticated" state in the UI instead of failing silently.

### 3. Working directory **[CONFIRMED]**

The spawned process `cwd` can be a context signal (these tools read files relative to it).

- **MVP: no project/file context.** Codex runs in a neutral app-controlled directory (never the app bundle) with `--skip-git-repo-check`; the chat does not send a workspace. side-pilot is a pure chat at this stage.
- Post-MVP: when active-app detection lands, prefer the detected workspace root (e.g. the VS Code workspace) as the `cwd`.

### 4. Permission / safety posture **[CONFIRMED: read-only]**

All three tools can execute commands and edit files. Running them headless from a floating widget requires a conservative default:

- **MVP and default = read-only.** Codex runs `-s read-only` — the concrete realization of the read-only decision. The same posture maps to Claude `--permission-mode plan` and Gemini `--approval-mode plan` when those adapters arrive.
- Write/execute modes (Codex `workspace-write`, Claude `acceptEdits`, Gemini `auto_edit`/`yolo`) are opt-in per session, surfaced clearly in the UI — out of MVP scope.
- "Bypass everything" modes are never the default.

### 5. Output handling **[CONFIRMED: blocking]**

- Parse the tool's JSON/JSONL into a typed result; never regex raw terminal text.
- Strip ANSI escape sequences defensively; render assistant text as **Markdown** in the chat.
- **Streaming:** MVP is **blocking** — read the final result (Codex `--output-last-message` / final event), then display, with a "thinking…" indicator during the wait. Token-by-token streaming (`stream-json` / Codex `--json` events) is a post-MVP enhancement that should not change the adapter's public interface.

### 6. Conversation continuity **[CONFIRMED for MVP: native session]**

Each CLI call is a fresh process. Two layers are always separate:

- **Display / history** — the app persists every message in its local SQLite store to render the chat and history. Unconditional, regardless of how context is carried.
- **Model context continuity** — how the CLI re-receives prior turns.

**MVP (Codex only):** use **Codex native session resume** (`codex exec resume` + stored `codex_session_id`) for model context continuity. No transcript composition needed.

> **Verified CLI constraint (codex-cli 0.128.0):** `codex exec resume <id>` does **not** accept `-s/--sandbox` or `-C/--cd` (unlike plain `codex exec`). A resumed run therefore inherits the read-only posture of its originating session and takes its working directory from the spawned process `cwd`. The captured session id is the `thread_id` field of the `thread.started` JSONL event.

**Known revisit (multi-tool):** native sessions are per-tool — they cannot represent one unified conversation, nor feed `/all` or `/summarize` (you cannot hand Codex's session to Claude). When tool #2 lands, continuity moves to **app-owned transcript replay** (compose `[prior turns + new message]` from the local store), likely a hybrid that keeps native session ids as an optimization. Persist `codex_session_id` / `claude_session_id` / `gemini_session_id` alongside the local session to support this.

### 7. Timeouts, cancellation, concurrency

- Per-adapter **timeout** (proposed default 120s, configurable). On timeout: terminate the process group, return `timedOut`.
- User-initiated **cancellation** terminates the process group. The front-end supplies a `run_id` on `run_adapter` and calls `cancel_adapter_run(run_id)` to cancel that in-flight subprocess.
- `/all` runs adapters **concurrently**; each result resolves independently, partial failures are shown per-tool (one tool failing does not block the others).

### 8. Error taxonomy

Every adapter maps failures to a shared enum so the UI can react uniformly:

```text
binaryNotFound        — executable not resolvable
notAuthenticated      — tool ran but reports no/invalid auth
nonZeroExit(code, stderr)
timedOut
outputParseFailure    — structured output missing or malformed
cancelled
```

### 9. Adapter interface (intent, not final API)

Adapters live in the Rust (Tauri) core; the React front-end calls them through a Tauri command. Sketch:

```rust
#[async_trait]
trait CliAdapter {
    fn id(&self) -> AssistantId;                  // Codex | Claude | Gemini
    async fn resolve_binary(&self) -> Result<PathBuf>; // §2, cached
    async fn run(&self, req: AdapterRequest) -> Result<AdapterResult, AdapterError>;
}

// AdapterRequest: prompt, working_directory?, model?, reasoning_effort?, permission_mode, timeout, resume_session_id?, run_id?
//   model + reasoning_effort apply on fresh runs (`-m`, `-c model_reasoning_effort=...`); resumed sessions inherit theirs (§6).
// AdapterResult: assistant_text (Markdown), raw_json, native_session_id?, usage?
// AdapterError: §8 taxonomy
```

The front-end calls `invoke("run_adapter", { request })`; the typed result is rendered in React. If the user cancels a pending run, the front-end calls `invoke("cancel_adapter_run", { runId })` using the same `run_id`. This makes blocking-vs-streaming, model selection, cancellation, and permission posture properties of the request — so the MVP can ship blocking + read-only and evolve without reshaping the contract.

## Session Model

The app should maintain its own internal conversation session.

Example:

```text
Local Session ID: assistant-session-001

Messages:
- User message
- Codex response
- Claude response
- Gemini response
- Final summary
```

For each local session, the app stores external CLI session references when available:

```text
codex_session_id
claude_session_id
gemini_session_id
```

**MVP (Codex only):** conversation continuity uses Codex's native session (`codex_session_id` + `codex exec resume`). The local SQLite store remains the source of truth for display and history. **Multi-tool phase:** continuity shifts to app-owned transcript replay, since native sessions cannot be shared across tools or drive `/all` and `/summarize` — see CLI Invocation Contract §6.

## Active Window Context

One of the key future features is context awareness.

The assistant should be able to understand where the user currently works.

Example context:

```text
Active app: VS Code
Window title: PlayForge — Visual Studio Code
Selected text: ...
Clipboard content: ...
Screenshot: optional
```

For VS Code specifically, there are two possible levels of integration:

### Basic Integration

Use per-OS native APIs to detect:

```text
- active app
- active window title
- selected text if available
- clipboard content
```

### Advanced Integration

Add a companion VS Code extension that sends richer IDE context to the side-pilot app:

```text
- current file path
- selected text
- full current file content
- workspace root
- opened tabs
- diagnostics
- git diff
- terminal output
```

## MVP Scope

The first version should stay small.

MVP features:

```text
- Tauri + React + TypeScript app (macOS + Windows from one codebase)
- Floating always-on-top bubble (Tauri window), draggable, click to expand/collapse
- Expandable chat panel (React)
- Local chat history in SQLite (tauri-plugin-sql / rusqlite, from the Rust core)
- CLI runner via Rust Command (login-shell/absolute-path binary resolution)
- One CLI: OpenAI Codex, read-only (codex exec --json, -s read-only)
- Blocking responses (rendered all at once)
- Codex native session resume for conversation continuity
- Thin routing seam (Rust CliAdapter trait + run_adapter command, Codex registered)
```

Deliberately NOT in the MVP (deferred): global hotkey, model selector, slash-command UI, any file/project context.

After MVP:

```text
- Add global open/close hotkey
- Add model selector and slash-command routing UI
- Add all three CLI adapters
- Switch conversation continuity to app-owned transcript replay (multi-tool)
- Add /all command
- Add /summarize command
- Add response comparison view
- Add active app detection
- Add clipboard integration
- Add selected text support
- Add VS Code companion extension
- Add screenshots
- Add voice input/output
```

## Why Tauri

The app must ship on **macOS and Windows** from one codebase while staying a lightweight always-on widget. That requirement rules out native SwiftUI (Apple-only — would mean two separate apps) and favors a cross-platform shell.

Tauri is chosen over Electron because it uses each OS's system WebView (WKWebView / WebView2) instead of bundling Chromium, so it is dramatically lighter — fitting an always-running bubble — while still giving a first-class React/TypeScript UI and easy subprocess execution from its Rust core.

The app needs deep OS behavior:

```text
- floating always-on-top window
- tray / menu-bar behavior
- global hotkeys
- OS permissions
- active window detection
- clipboard access
- accessibility / UI-automation integration (selected text)
- screen capture
- possible voice input/output
```

Most of these have cross-platform Tauri APIs/plugins. The few that don't — selected-text capture and the non-activating panel — are per-OS native work in **any** stack; Tauri isolates them to small Rust shims (`objc2` on macOS, `windows` crate on Windows) while everything else stays shared. That trade is better than maintaining two fully native apps.

## Risks

Main technical risks:

```text
- CLI output formats may change
- CLI tools may not expose stable session handling
- parsing interactive CLI output can be fragile
- cross-platform parity: features/permissions/install paths differ on macOS vs Windows
- system-WebView differences (WKWebView vs WebView2) can cause UI/behavior gaps
- deep-OS shims (selected text, non-activating panel) need per-OS native Rust (objc2 / windows crate) — the hardest part of the stack
- macOS Accessibility / Windows UI-Automation permissions can be tricky
- selected text extraction may not work reliably in every app
- screen capture requires permissions
- distribution: macOS notarization + Windows code-signing, both with CLI execution and permissions
```

## Recommended Development Strategy

Build the project step by step:

```text
1. Scaffold a Tauri + React + TypeScript app (verify it builds on macOS and Windows).
2. Add a floating always-on-top bubble (Tauri window) with click expand/collapse.
3. Add a simple chat UI (React).
4. Add local message history in SQLite (tauri-plugin-sql / rusqlite).
5. Add the thin routing seam (Rust CliAdapter trait + run_adapter command).
6. Add the Codex adapter (read-only, blocking, native session resume).
   — MVP ends here: a usable read-only Codex chat on both OSes.
7. Add the global open/close hotkey (tauri-plugin-global-shortcut).
8. Add the second and third CLI adapters.
9. Switch conversation continuity to app-owned transcript replay (multi-tool).
10. Add command routing UI (slash + model selector) and /all mode.
11. Add active application detection (per-OS native shim).
12. Add clipboard and selected text support (per-OS native shim).
13. Add VS Code companion extension if needed.
```

## Final Product Vision

A personal desktop AI assistant (macOS and Windows) that stays available everywhere, understands the current working context, and lets the user quickly ask Codex, Claude, Gemini, or all of them from one unified floating chat.

It should feel like a lightweight AI command center for the desktop.
