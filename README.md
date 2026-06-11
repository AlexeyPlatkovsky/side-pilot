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

Desktop app:

```bash
npm run tauri dev
```

React UI only in browser (Vite port `5175`; Tauri points at `http://localhost:5175`):

```bash
npm run dev
```

## Test

```bash
npm run test                                       # Front-end unit tests (Vitest)
npm run test:e2e                                   # WebKit E2E (Playwright)
npm run lint                                       # Front-end lint (ESLint)
npm run format:check                               # Front-end format (Prettier)
npm run gen:bindings                               # Regenerate typed IPC bindings
cargo nextest run --manifest-path src-tauri/Cargo.toml                      # Rust core tests
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings  # Rust lint
```

IPC bindings (`src/chat/generated/`) are auto-generated from Rust structs via `ts-rs`. CI fails on drift — regenerate after changing adapted or storage structs. Do not edit by hand.

First-time E2E setup: `npx playwright install webkit`.
Missing `cargo-nextest`: `cargo install cargo-nextest`.

Lint, format, build, test, WebKit, nextest, and clippy all run in CI (`.github/workflows/ci.yml`).

## Build

Build the front-end:

```bash
npm run build
```

Build the desktop app package:

```bash
npm run tauri build
```

## How to set up a custom CLI

Beyond the three built-in providers (Codex, Claude, Gemini), you can register
any local CLI tool that reads a prompt from **stdin** and writes its reply to
**stdout**.

1. Open **Settings → CLI Integrations** and click **Add** (upper-right).
2. Enter a **CLI name** (≤30 chars, e.g. `OpenCode`) — the label shown in the AI
   switcher and the transcript.
3. Enter a **CLI Prompt Command** (≤100 chars, e.g. `opencode --prompt` or
   `cline`). side-pilot runs this through your login shell, writes the prompt to
   the process's stdin, and treats plain stdout as the reply.
4. Optionally click **Test**: it sends `hello` (30 s timeout) and reports whether
   the CLI is reachable. Success is exit code `0` with non-empty stdout.
5. Click **Save**. The CLI starts **enabled** if fewer than 3 CLIs are already
   enabled (the global cap of 3 covers built-ins and custom CLIs combined),
   otherwise it is saved disabled.

Custom CLIs appear in the AI switcher and participate in **All** routing on the
same terms as the built-ins. Each registered entry has a **Re-check** button
(re-runs the stdin test) and a **Delete** button (removes the provider after a
confirmation; existing chat messages are preserved). The base command (first
whitespace-delimited token) must be unique and may not be a reserved built-in
token (`codex`, `claude`, `gemini`). Entries persist in `preferences.json`.

## Docs

For developers and AI implementers — detailed reference material lives in `docs/`:

- `docs/idea.md` — product specification and architecture intent
- `docs/architecture/` — implemented architecture reference (UI, IPC, Rust core, DB)
- `docs/design-book.md` — design system tokens (spacing, radius, color, icon, type)
- `docs/source-tree.md` — detailed source file descriptions for implementers
