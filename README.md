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
- `src-tauri/src/lib.rs` - Tauri command and plugin setup
- `src-tauri/src/adapters/` - CLI routing seam: the `CliAdapter` trait, typed
  request/result/error contract, binary and environment resolution, the
  `AdapterRegistry`, and the read-only Codex adapter behind the `run_adapter`
  and `cancel_adapter_run` commands
- `src-tauri/tauri.conf.json` - Tauri app/window configuration
- `src-tauri/icons/warm-friendly-source.svg` - source icon for this warm
  friendly assistant variant
- `src/assets/app-icon_3.png` - single source for the app mark: the UI imports
  it for the collapsed bubble and panel header, and the bundled app/Dock icons
  in `src-tauri/icons/` are generated from it via `npm run tauri -- icon
  src/assets/app-icon_3.png` (macOS/Windows outputs only; remove any generated
  `ios/`/`android/` folders per the platform scope)
