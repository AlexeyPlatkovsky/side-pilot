# macOS Scenes Reference

## Key Scene Types

**Settings** — Presents preferences window accessible via Cmd+,. Automatically managed by SwiftUI with support for tabbed multi-pane layouts.

**MenuBarExtra** — Persistent system menu bar control available in two styles: `.menu` (dropdown) or `.window` (popover panel). Supports toggleability and menu-bar-only apps.

**WindowGroup** — Enables multiple window instances with tabbed interfaces and automatic Window menu commands. Keeps app running after all windows close.

**Window** — Single, unique window scene. When used as sole scene, app quits upon window closure.

**UtilityWindow** — Floating tool palette (macOS 15.0+) that receives FocusedValues from active main window. Auto-hides when app inactive. Similar to `NSPanel` — use for floating assistant panels.

**DocumentGroup** — Document-based apps with automatic File menu commands. Requires conformance to `FileDocument` or `ReferenceFileDocument`.

## Implementation Guidelines

Use `#if os(macOS)` conditionals to gate macOS-only scenes in multiplatform projects. Prefer `WindowGroup` for primary scenes and `Window` for supplementary singletons. Use `UtilityWindow` for floating panels that need to stay on top. Implement `DocumentGroup` for document-centric applications requiring file management.

## side-pilot Notes

The floating bubble and assistant panel map directly to `UtilityWindow` or `NSPanel`-backed `WindowGroup` with `.windowStyle(.hiddenTitleBar)`. `MenuBarExtra` with `.window` style suits a persistent menu-bar entry point.
