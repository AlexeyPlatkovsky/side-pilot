# Tauri Windowing & the Floating / Non-Activating Panel

side-pilot's identity is an always-on-top bubble that expands into a chat panel, on macOS **and** Windows.

## Baseline floating window (cross-platform, no native code)

Configure in `tauri.conf.json` (or at runtime via `WebviewWindowBuilder`):

- `alwaysOnTop: true`
- `decorations: false` (frameless bubble)
- `transparent: true` (rounded/transparent bubble; requires `macOSPrivateApi: true` on macOS for true transparency)
- `skipTaskbar: true` (Windows) / accessory activation policy (macOS) so it behaves like a widget, not a normal app window
- `resizable` as needed; the bubble is fixed-size, the expanded panel may resize
- Drag via the JS `getCurrentWindow().startDragging()` on a pointer-down handler, or CSS `data-tauri-drag-region` on the drag surface

Show above fullscreen apps / on all spaces: set the window to join all spaces / be a utility-style window. On macOS this needs the panel behavior below; the cross-platform `setVisibleOnAllWorkspaces`-style flags cover the simpler cases.

## The non-activating panel (per-OS native shim, post-MVP)

"Type in the bubble without your editor losing focus" is **not** available from plain Tauri window config — clicking a normal window takes key focus.

- **macOS:** convert the `NSWindow` backing the Tauri webview into a non-activating `NSPanel` (`.nonactivatingPanel` style mask, `.canJoinAllSpaces`/`.fullScreenAuxiliary` collection behavior). Prior art exists (e.g. `dannysmith/tauri-template`'s Quick Pane). Implement in Rust via `objc2`, gated behind `#[cfg(target_os = "macos")]`.
- **Windows:** use the `WS_EX_NOACTIVATE` extended window style via the `windows` crate, gated behind `#[cfg(target_os = "windows")]`.

Keep this behind one Rust function (e.g. `make_panel(window)`) with a no-op/empty default, so React never knows the difference.

## Rules
- The bubble window config lives in Rust/`tauri.conf.json`, never re-implemented in React.
- Any window-level behavior that differs by OS goes behind a `#[cfg(...)]` Rust shim with a documented common interface.
- Don't block the MVP on the non-activating panel — a normal always-on-top window is acceptable for v1; the panel upgrade is post-MVP (see `docs/idea.md`).
