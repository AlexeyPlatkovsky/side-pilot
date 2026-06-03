# SwiftUI Sheet, Navigation & Inspector Patterns Reference

## Sheet Patterns

### Item-Driven Sheets (Preferred)

```swift
@State private var selectedItem: Item?

var body: some View {
    List(items) { item in
        Button(item.name) { selectedItem = item }
    }
    .sheet(item: $selectedItem) { item in
        ItemDetailSheet(item: item)
    }
}
```

### Sheets Own Their Actions

Sheets should handle dismiss internally using `@Environment(\.dismiss)`. Avoid passing `onSave`/`onCancel` closures.

```swift
struct EditItemSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form { /* ... */ }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Save") { /* save and dismiss */ } }
                }
        }
    }
}
```

### Enum-Based Sheet Management

```swift
enum Sheet: Identifiable {
    case add, edit(Article), categories
    var id: String {
        switch self {
        case .add: "add"
        case .edit(let a): "edit-\(a.id)"
        case .categories: "categories"
        }
    }
}

@State private var presentedSheet: Sheet?

List { /* ... */ }
    .sheet(item: $presentedSheet) { sheet in
        switch sheet {
        case .add: AddArticleView()
        case .edit(let article): EditArticleView(article: article)
        case .categories: CategoriesView()
        }
    }
```

## Navigation Patterns

### Type-Safe Navigation with NavigationStack

```swift
NavigationStack {
    List {
        NavigationLink("Profile", value: Route.profile)
    }
    .navigationDestination(for: Route.self) { route in
        switch route {
        case .profile: ProfileView()
        case .settings: SettingsView()
        }
    }
}

enum Route: Hashable { case profile, settings }
```

### Programmatic Navigation

```swift
@State private var navigationPath = NavigationPath()

NavigationStack(path: $navigationPath) {
    List {
        Button("Go to Detail") {
            navigationPath.append(DetailRoute.item(id: 1))
        }
    }
    .navigationDestination(for: DetailRoute.self) { route in /* ... */ }
}
```

## NavigationSplitView

```swift
NavigationSplitView {
    List(items, selection: $selectedItem) { item in Text(item.name) }
    .navigationTitle("Items")
} detail: {
    if let selectedItem, let item = items.first(where: { $0.id == selectedItem }) {
        ItemDetailView(item: item)
    } else {
        ContentUnavailableView("Select an Item", systemImage: "doc")
    }
}
```

## Inspector (iOS 17+, macOS 14+)

```swift
MyEditorView()
    .inspector(isPresented: $showInspector) {
        InspectorContent()
            .inspectorColumnWidth(min: 200, ideal: 250, max: 400)
    }
```

**Platform behavior:** macOS — trailing-edge sidebar; iPhone — sheet.

## Summary Checklist

- [ ] Use `.sheet(item:)` for model-based sheets
- [ ] Sheets own their actions and dismiss internally
- [ ] Use `NavigationStack` with `navigationDestination(for:)` for type-safe navigation
- [ ] Use `NavigationPath` for programmatic navigation
- [ ] Use `NavigationSplitView` for sidebar-driven multi-column layouts
- [ ] Use `Inspector` for trailing-edge supplementary panels
- [ ] Avoid passing dismiss/save callbacks to sheets
- [ ] Use enum-based `Identifiable` type with `.sheet(item:)` for multiple sheets
