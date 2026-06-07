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

## Docs

For developers and AI implementers — detailed reference material lives in `docs/`:

- `docs/idea.md` — product specification and architecture intent
- `docs/architecture/` — implemented architecture reference (UI, IPC, Rust core, DB)
- `docs/design-book.md` — design system tokens (spacing, radius, color, icon, type)
- `docs/source-tree.md` — detailed source file descriptions for implementers
