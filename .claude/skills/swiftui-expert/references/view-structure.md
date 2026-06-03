# SwiftUI View Structure Reference

## Recommended View File Structure

```swift
struct ContentView: View {
    // 1. Environment Properties
    @Environment(\.colorScheme) var colorScheme

    // 2. State Properties
    @Binding var isToggled: Bool
    @State private var viewModel: SomeViewModel

    // 3. Private Properties
    private let title: String = "SwiftUI Guide"

    // 4. Initializer (if needed)
    init(isToggled: Binding<Bool>) {
        self._isToggled = isToggled
    }

    // 5. Body
    var body: some View { /* ... */ }

    // 6. Computed Subviews
    private var header: some View { /* ... */ }
}
```

## Extract Subviews, Not Computed Properties

When you use `@ViewBuilder` functions, the entire function re-executes on every parent state change. Extract to separate `struct` views so SwiftUI can skip their `body` when inputs don't change:

```swift
// GOOD - ComplexSection body SKIPPED when its inputs don't change
struct ParentView: View {
    @State private var count = 0

    var body: some View {
        VStack {
            Button("Tap: \(count)") { count += 1 }
            ComplexSection()  // Body skipped during re-evaluation
        }
    }
}

struct ComplexSection: View {
    var body: some View { /* expensive content */ }
}
```

## Prefer Modifiers Over Conditional Views

```swift
// GOOD - same view, different states (maintains identity, enables animation)
SomeView()
    .opacity(isVisible ? 1 : 0)

// AVOID - creates/destroys view identity
if isVisible {
    SomeView()
}
```

Use conditionals when you truly have **different views**, not different states.

## Container View Pattern

Use `@ViewBuilder let content: Content` not `() -> Content` (closures can't be compared):

```swift
// GOOD
struct MyContainer<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack {
            Text("Header")
            content
        }
    }
}
```

## Lazy Containers for Large Data Sets

```swift
ScrollView {
    LazyVStack {
        ForEach(items) { item in
            ExpensiveRow(item: item)
        }
    }
}
```

## ZStack vs overlay/background

- `overlay` / `background` — decorating a primary view; expresses intent clearly
- `ZStack` — composing multiple peer views that jointly define layout

## Compositing Group Before Clipping

Always add `.compositingGroup()` before `.clipShape()` when clipping layered views to avoid color fringes at corners:

```swift
Color.red
    .overlay(.white, in: .rect)
    .compositingGroup()   // Composite first
    .clipShape(RoundedRectangle(cornerRadius: 16))
```

## Reusable Styling with ViewModifier

```swift
private struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(Color(.secondarySystemBackground))
            .clipShape(.rect(cornerRadius: 12))
    }
}

extension View {
    func cardStyle() -> some View { modifier(CardStyle()) }
}
```

## Debug View Updates

```swift
var body: some View {
    let _ = Self._logChanges()  // Xcode 15.1+
    // or Self._printChanges()
    /* content */
}
```

Remove from production code.

## Summary Checklist

- [ ] Follow consistent view file structure (Environment → State → Private → Init → Body → Subviews)
- [ ] Prefer modifiers over conditional views for state changes
- [ ] Extract complex views into separate subviews, not computed properties
- [ ] Container views use `@ViewBuilder let content: Content`
- [ ] Use lazy containers for large data sets
- [ ] Prefer `overlay`/`background` for decoration; `ZStack` for peer composition
- [ ] `.compositingGroup()` before `.clipShape()` on layered views
- [ ] Avoid `AnyView` unless type erasure is truly needed
