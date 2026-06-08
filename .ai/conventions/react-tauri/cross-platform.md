# Cross-Platform / WebView Differences

side-pilot ships on macOS and Windows from one codebase. Tauri uses the **system** WebView, which differs by OS:

- **macOS:** WKWebView (WebKit)
- **Windows:** WebView2 (Chromium-based)
- (Linux: WebKitGTK — not a target but shares WebKit quirks with macOS)

A feature that works in your dev browser (Chromium) can fail in the packaged macOS app (WebKit). Treat WebKit as the stricter target.

## Common divergences to flag
- Newer/experimental CSS or JS APIs that ship in Chromium before WebKit — gate or polyfill, or avoid.
- Font rendering, scrollbar styling, `backdrop-filter`, and transparency behavior differ — verify the bubble looks right on both.
- Date/Intl, clipboard, and media APIs can differ — prefer Tauri plugins (`clipboard-manager`, etc.) over raw browser APIs for anything that touches the OS.
- Keyboard event differences (modifier keys: ⌘ on macOS vs Ctrl on Windows) — normalize shortcut handling per-OS.

## Rules
- Don't use an engine-specific API without a documented cross-engine fallback.
- Prefer Tauri plugins over browser APIs for OS-touching capabilities (clipboard, fs, shell, notifications).
- Normalize platform keyboard modifiers (⌘/Ctrl) in one place.
- When in doubt, the macOS/WebKit behavior is the constraint — design to it.
