# macOS Views & Components Reference

> macOS-specific SwiftUI views, file operations, drag & drop, and AppKit interop. Covers `HSplitView`, `VSplitView`, `Table`, `PasteButton`, file dialogs, cross-app drag & drop, and `NSViewRepresentable`.

## Quick Lookup Table

### Views

| API | Availability | macOS-Only? | Usage |
|-----|-------------|:-----------:|-------|
| `HSplitView` | macOS 10.15+ | Yes | Horizontal resizable split layout with user-draggable dividers |
| `VSplitView` | macOS 10.15+ | Yes | Vertical resizable split layout with user-draggable dividers |
| `Table` | macOS 12.0+ | No | Full multi-column layout with sorting; on iOS compact, columns collapse |
| `PasteButton` | macOS 10.15+ | No | System button that reads clipboard; does NOT auto-validate on macOS |
| `CopyButton` | macOS 15.0+ | Yes | System button that copies `Transferable` content to clipboard |

### File Operations

| API | Availability | macOS-Only? | Usage |
|-----|-------------|:-----------:|-------|
| `fileImporter()` | macOS 11.0+ | No | Native NSOpenPanel with column/list/gallery view, sidebar, tags, QuickLook |
| `fileExporter()` | macOS 11.0+ | No | Native NSSavePanel with format dropdown, tags field |
| `fileMover()` | macOS 11.0+ | No | Native macOS move panel with Finder-like navigation |
| `fileDialogMessage(_:)` | macOS 13.0+ | Yes | Custom message text in file dialogs |
| `fileDialogConfirmationLabel(_:)` | macOS 13.0+ | Yes | Custom confirm button text in file dialogs |

### AppKit Interop

| API | Availability | macOS-Only? | Usage |
|-----|-------------|:-----------:|-------|
| `NSViewRepresentable` | macOS 10.15+ | Yes | Wrap an AppKit `NSView` in SwiftUI |
| `NSViewControllerRepresentable` | macOS 10.15+ | Yes | Wrap an AppKit `NSViewController` in SwiftUI |
| `NSHostingController` | macOS 10.15+ | Yes | Host SwiftUI inside an AppKit view controller |
| `NSHostingView` | macOS 10.15+ | Yes | Host SwiftUI inside an AppKit `NSView` hierarchy |

---

## HSplitView & VSplitView (macOS-only)

Resizable split layouts with user-draggable dividers. Use for IDE-style panes where all panels are equal peers.

```swift
HSplitView {
    FileTreeView()
        .frame(minWidth: 200)
    CodeEditorView()
        .frame(minWidth: 400)
    PreviewPane()
        .frame(minWidth: 200)
}
```

> **When to use which:**
> - **`NavigationSplitView`** — sidebar-based navigation (sidebar drives content/detail)
> - **`HSplitView`/`VSplitView`** — IDE-style layouts where all panes are equal peers

---

## Table

For `Table` basics (creation, selection, sorting, adaptive compact layout), see `list-patterns.md`. macOS-specific styles:

```swift
// Bordered with alternating row backgrounds (macOS-only)
Table(people) { /* columns */ }
    .tableStyle(.bordered(alternatesRowBackgrounds: true))

// Inset (no borders)
Table(people) { /* columns */ }
    .tableStyle(.inset)

// Hide column headers
Table(people) { /* columns */ }
    .tableColumnHeaders(.hidden)
```

---

## PasteButton & CopyButton

```swift
// PasteButton — reads clipboard
PasteButton(payloadType: String.self) { strings in
    pastedText = strings[0]
}

// CopyButton (macOS 15.0+, macOS-only)
CopyButton(item: shareableText)
```

---

## File Operations

### fileImporter

```swift
.fileImporter(
    isPresented: $showImporter,
    allowedContentTypes: [.pdf],
    allowsMultipleSelection: false
) { result in
    if case .success(let urls) = result, let url = urls.first {
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }
        // use url
    }
}
```

> **Important:** Always call `startAccessingSecurityScopedResource()` on returned URLs.

### fileExporter

```swift
.fileExporter(
    isPresented: $showExporter,
    document: document,
    contentType: .plainText,
    defaultFilename: "MyFile.txt"
) { result in
    // handle Result<URL, Error>
}
```

---

## Drag, Drop & Pasteboard

On macOS, drag and drop works **across applications** (e.g., drag from your app to Finder).

### Modern approach (Transferable)

```swift
// Drag source
Text(item.title)
    .draggable(item)  // Requires Transferable conformance

// Drop target
VStack { /* content */ }
    .dropDestination(for: MyItem.self) { items, location in
        droppedItems.append(contentsOf: items)
        return true
    }
```

---

## AppKit Interop

### NSViewRepresentable (macOS-only)

```swift
struct WebView: NSViewRepresentable {
    let url: URL
    func makeNSView(context: Context) -> WKWebView { WKWebView() }
    func updateNSView(_ nsView: WKWebView, context: Context) {
        nsView.load(URLRequest(url: url))
    }
}
```

### NSViewRepresentable with Coordinator

```swift
struct SearchField: NSViewRepresentable {
    @Binding var text: String

    func makeNSView(context: Context) -> NSSearchField {
        let field = NSSearchField()
        field.delegate = context.coordinator
        return field
    }
    func updateNSView(_ nsView: NSSearchField, context: Context) {
        nsView.stringValue = text
    }
    func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

    class Coordinator: NSObject, NSSearchFieldDelegate {
        var text: Binding<String>
        init(text: Binding<String>) { self.text = text }
        func controlTextDidChange(_ obj: Notification) {
            if let field = obj.object as? NSSearchField {
                text.wrappedValue = field.stringValue
            }
        }
    }
}
```

> **Warning:** Never set `frame`/`bounds` directly on the managed `NSView` — SwiftUI owns the layout.

### NSHostingController & NSHostingView

```swift
// Host SwiftUI as a view controller
let hostingController = NSHostingController(rootView: MySwiftUIView())
window.contentViewController = hostingController

// Host SwiftUI directly as an NSView
let hostingView = NSHostingView(rootView: MySwiftUIView())
someNSView.addSubview(hostingView)
```

---

## Best Practices

- Use `NavigationSplitView` for sidebar-driven navigation — reserve `HSplitView`/`VSplitView` for IDE-style equal peer panes
- Always call `startAccessingSecurityScopedResource()` on URLs from `fileImporter`
- Use `Transferable` for drag & drop (modern) — fall back to `NSItemProvider` only for legacy compatibility
- Never set `frame`/`bounds` directly on views managed by `NSViewRepresentable`
- Prefer native SwiftUI over AppKit interop when possible
