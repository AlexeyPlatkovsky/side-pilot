# SwiftUI Previews Reference

## Preview Macro

The `#Preview` macro (Swift 5.9+, Xcode 15+) is the modern way to declare previews:

```swift
// Basic
#Preview { ContentView() }

// Named
#Preview("Dark Mode") {
    ContentView().preferredColorScheme(.dark)
}

// Traits
#Preview(traits: .fixedLayout(width: 300, height: 100)) {
    CompactBanner(message: "Welcome")
}
#Preview(traits: .sizeThatFitsLayout) { BadgeView(count: 5) }
#Preview(traits: .landscapeLeft) { DashboardView() }
```

Declare one `#Preview` per meaningful state (default, empty, error, loading).

## Preview with Mock Data

Previews must compile and render without external dependencies. Use self-contained sample data:

```swift
extension Item {
    static let sample = Item(id: UUID(), name: "Widget", price: 9.99)
    static let samples: [Item] = [ /* ... */ ]
}

#Preview { ItemListView(items: Item.samples) }
```

For `@Observable` models:

```swift
extension CartModel {
    static var preview: CartModel {
        let model = CartModel()
        model.items = Item.samples
        return model
    }
}

#Preview("With Items") {
    CartView().environment(CartModel.preview)
}

#Preview("Loading") {
    CartView().environment(CartModel.loadingPreview)
}
```

## @Previewable Property Wrappers (iOS 18+)

Allows using `@State`, `@FocusState`, etc. directly in `#Preview` blocks:

```swift
#Preview {
    @Previewable @State var isOn = false
    Toggle("Notifications", isOn: $isOn)
}
```

For `@FocusState`, prefer `.defaultFocus` over `.onAppear` (avoids timing race):

```swift
#Preview {
    @Previewable @FocusState var isFocused: Bool
    TextField("Search", text: .constant(""))
        .focused($isFocused)
        .defaultFocus($isFocused, true)
}
```

## Common Diagnostics

| Symptom | Cause | Fix |
|---|---|---|
| Preview crashes with "missing environment" | `@Environment(SomeType.self)` not injected | Add `.environment(SomeType.preview)` |
| Preview hangs or renders blank | View depends on async data | Inject a mock that returns immediately |
| `@Previewable` only available in iOS 18+ | Lower deployment target | Use a wrapper view |

## Summary Checklist

- [ ] Prefer `#Preview` for new previews
- [ ] Provide a named preview for each meaningful state
- [ ] Use `@Previewable` for interactive previews (iOS 18+); wrapper views otherwise
- [ ] Expose static `.sample`/`.preview` data on models
- [ ] Never depend on live network or disk I/O in a preview
- [ ] Prefer `.defaultFocus` over `.onAppear` writes when seeding `@FocusState`
