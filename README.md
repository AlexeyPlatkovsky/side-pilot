# side-pilot

A cross-platform desktop (macOS + Windows) floating AI assistant. A small,
always-on-top bubble expands into a unified chat panel that routes prompts to
local AI CLI tools (OpenAI Codex first; Claude Code and Gemini later) through a
Rust core.

Built with **Tauri v2 (Rust) + React + TypeScript + Vite**. See
[`docs/idea.md`](docs/idea.md) for the full design specification and MVP scope.

## Prerequisites

- **Node.js** 18+ and npm
- **Rust** (stable) with Cargo — install via [rustup](https://rustup.rs)
- **cargo-nextest** — the project's Rust test runner: `cargo install cargo-nextest` (or a prebuilt binary from <https://get.nexte.st>)
- Platform toolchain for Tauri v2:
  - **macOS:** Xcode Command Line Tools
  - **Windows:** Microsoft C++ Build Tools and the WebView2 runtime (see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install front-end dependencies |
| `npm run tauri dev` | Run the desktop app with hot-reload (starts Vite, then the Tauri shell) |
| `npm run dev` | Run only the Vite front-end in a browser (no Tauri APIs) |
| `npm run build` | Type-check and build the front-end bundle (`tsc && vite build`) |
| `npm run tauri build` | Build the distributable desktop app |
| `npm run test` | Run the front-end test suite (Vitest + React Testing Library) |
| `npm run test:watch` | Run the front-end tests in watch mode |
| `cargo nextest run --manifest-path src-tauri/Cargo.toml` | Run the Rust core test suite |
| `cargo build --manifest-path src-tauri/Cargo.toml` | Build only the Rust core |

## Source layout

```
src/                       React + TypeScript front-end
  main.tsx                 React entry point
  App.tsx                  UI root (renders the Bubble)
  components/              UI components (Bubble, future chat panel)
  state/                   Front-end logic (bubble state machine, window resize)
  styles.css               Global styles
src-tauri/                 Tauri v2 Rust core
  src/main.rs              Binary entry point → side_pilot_lib::run()
  src/lib.rs               Tauri builder, command registration, module map
  src/commands.rs          Tauri command handlers (IPC seam the UI invokes)
  src/adapters/            CLI adapter seam (Codex/Claude/Gemini) — SP-008+
  src/storage/             Local SQLite persistence seam — SP-007
  tauri.conf.json          App + window configuration
  capabilities/            Tauri v2 permission capabilities
  icons/                   App icons
docs/idea.md               Primary design specification
```

## Cross-platform notes

The app targets macOS and Windows from one codebase via Tauri's cross-platform
window APIs. Platform-specific details to be aware of:

- **Transparent window (macOS):** the floating bubble uses a transparent,
  undecorated, always-on-top window. On macOS this requires Tauri's
  `macOSPrivateApi` (enabled in `tauri.conf.json` and the `macos-private-api`
  crate feature). This uses private macOS APIs and can block Mac App Store
  distribution — acceptable for a sideloaded widget; revisit if App Store
  distribution is ever required. On Windows, transparency is handled by WebView2
  without a private-API flag.
- **System WebView:** Tauri renders with WKWebView on macOS and WebView2 on
  Windows. Behavioral/rendering differences between the two are a known risk
  (see `docs/idea.md` §Risks) and UI should be checked on both.
- **CLI binary resolution (future):** a GUI app does not inherit the user's
  shell `PATH`. Adapters must resolve CLI binaries to absolute paths per OS —
  see `docs/idea.md` §"Binary resolution and environment".
- The current scaffold has been built and verified on **macOS**. Windows build
  verification is a follow-up once a Windows toolchain is available.

## Status

This is the application shell (SP-002): the scaffold (SP-003) and the floating
bubble window (SP-004). Chat UI, SQLite storage, and the Codex CLI adapter are
tracked as later Beads items under the MVP epic (SP-001).
