# macOS Window & Toolbar Styling Reference

> Window configuration, toolbar styles, sizing, positioning, and navigation patterns specific to macOS SwiftUI apps.

## Quick Lookup Table

| API | Availability | macOS-Only? | Usage |
|-----|-------------|:-----------:|-------|
| `windowToolbarStyle(_:)` | macOS 11.0+ | Yes | Sets toolbar style: `.unified`, `.unifiedCompact`, `.expanded` |
| `windowStyle(_:)` | macOS 11.0+ | No | Supports `.hiddenTitleBar` for chromeless windows |
| `windowResizability(_:)` | macOS 13.0+ | No | Controls resize handle and green zoom button behavior |
| `defaultSize(width:height:)` | macOS 13.0+ | No | Initial frame size when user creates a new window |
| `defaultPosition(_:)` | macOS 13.0+ | No | Initial window position on screen |
| `windowIdealPlacement(_:)` | macOS 15.0+ | No | Closure with display geometry for precise window positioning |
| `menuBarExtraStyle(_:)` | macOS 13.0+ | Yes | Sets MenuBarExtra to `.menu` or `.window` style |
| `NavigationSplitView` | macOS 13.0+ | No | Columns always visible side-by-side on macOS; translucent sidebar |
| `Inspector` | macOS 14.0+ | No | Trailing-edge sidebar panel; resizable by dragging |

---

## Toolbar Styles

### windowToolbarStyle (macOS-only)

```swift
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowToolbarStyle(.unified)
    }
}
```

**Available styles:**

| Style | Description |
|-------|-------------|
| `.automatic` | System default |
| `.unified` | Title bar and toolbar in a single combined row |
| `.unifiedCompact` | Same as unified but with reduced vertical height |
| `.expanded` | Title bar displayed above the toolbar (more toolbar space) |

```swift
// Unified compact — minimal chrome
.windowToolbarStyle(.unifiedCompact)

// Unified with title hidden
.windowToolbarStyle(.unified(showsTitle: false))
```

---

## Window Style

```swift
// Hidden title bar — chromeless window (for floating panel)
WindowGroup {
    ContentView()
}
.windowStyle(.hiddenTitleBar)
```

---

## Window Sizing

```swift
WindowGroup {
    ContentView()
        .frame(minWidth: 600, minHeight: 400)
}
.defaultSize(width: 900, height: 600)
.defaultPosition(.center)
.windowResizability(.contentMinSize)
```

**`windowResizability` options:**

| Value | Behavior |
|-------|----------|
| `.automatic` | System decides |
| `.contentSize` | Fixed to content size; no user resize |
| `.contentMinSize` | Resizable with minimum based on content's `minWidth`/`minHeight` |

**`defaultPosition` options:** `.center`, `.topLeading`, `.top`, `.topTrailing`, `.leading`, `.trailing`, `.bottomLeading`, `.bottom`, `.bottomTrailing`

### windowIdealPlacement (macOS 15.0+)

```swift
.windowIdealPlacement { context in
    let screen = context.defaultDisplay.visibleArea
    return WindowPlacement(x: screen.midX, y: screen.midY,
                           width: screen.width / 2, height: screen.height)
}
```

---

## MenuBarExtra Style (macOS-only)

```swift
// Dropdown menu
MenuBarExtra("Status", systemImage: "chart.bar") {
    Button("Action") { /* ... */ }
}
.menuBarExtraStyle(.menu)

// Popover panel with custom SwiftUI content
MenuBarExtra("Status", systemImage: "chart.bar") {
    DashboardView()
}
.menuBarExtraStyle(.window)
```

---

## Navigation Layout

### NavigationSplitView

On macOS, `NavigationSplitView` displays columns side-by-side. The sidebar gets translucent material. Columns support variable-width resizing.

```swift
NavigationSplitView {
    List(items, selection: $selectedId) { item in
        Text(item.name)
    }
    .navigationSplitViewColumnWidth(min: 180, ideal: 220, max: 300)
} detail: {
    DetailView(id: selectedId)
}
.navigationSplitViewStyle(.balanced)
```

### Inspector (macOS 14.0+)

```swift
struct ContentView: View {
    @State private var showInspector = false

    var body: some View {
        MainContent()
            .inspector(isPresented: $showInspector) {
                InspectorView()
                    .inspectorColumnWidth(min: 200, ideal: 250, max: 400)
            }
            .toolbar {
                ToolbarItem {
                    Button { showInspector.toggle() } label: {
                        Label("Inspector", systemImage: "info.circle")
                    }
                }
            }
    }
}
```

---

## Commands & Keyboard

```swift
.commands {
    CommandMenu("Tools") {
        Button("Run Analysis") { /* ... */ }
            .keyboardShortcut("r", modifiers: [.command, .shift])
    }
    CommandGroup(after: .newItem) {
        Button("New From Template...") { /* ... */ }
    }
}
```

### openWindow

```swift
struct ToolbarActions: View {
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Button("Connection Doctor") {
            openWindow(id: "connection-doctor")
        }
    }
}
```

---

## Best Practices

- Use `.unified` or `.unifiedCompact` for most apps
- Set min frame sizes on content and use `.windowResizability(.contentMinSize)` to enforce them
- Always provide `defaultSize` so new windows start at a reasonable size
- Use `NavigationSplitView` for sidebar navigation — not `HSplitView`
- Use `Inspector` for supplementary panels
- Define `Commands` for all repeatable actions — users expect keyboard shortcuts on macOS
- Use `#if os(macOS)` to wrap macOS-only window configuration in multiplatform projects
