# SwiftUI State Management Reference

## Property Wrapper Selection Guide

| Wrapper | Use When | Notes |
|---------|----------|-------|
| `@State` | Internal view state that triggers updates | Must be `private` |
| `@Binding` | Child view needs to modify parent's state | Don't use for read-only |
| `@Bindable` | iOS 17+: View receives `@Observable` object and needs bindings | For injected observables |
| `let` | Read-only value passed from parent | Simplest option |
| `var` | Read-only value that child observes via `.onChange()` | For reactive reads |

**Legacy (Pre-iOS 17):**
| Wrapper | Use When | Notes |
|---------|----------|-------|
| `@StateObject` | View owns an `ObservableObject` instance | Use `@State` with `@Observable` instead |
| `@ObservedObject` | View receives an `ObservableObject` from outside | Never create inline |

## @State

Always mark `@State` properties as `private`. Use for internal view state.

### iOS 17+ with @Observable (Preferred)

**Always prefer `@Observable` over `ObservableObject`.** Use `@State` instead of `@StateObject`:

```swift
@Observable
@MainActor
final class DataModel {
    var name = "Some Name"
    var count = 0
}

struct MyView: View {
    @State private var model = DataModel()

    var body: some View {
        VStack {
            TextField("Name", text: $model.name)
            Stepper("Count: \(model.count)", value: $model.count)
        }
    }
}
```

**Critical**: When a view *owns* an `@Observable` object, always use `@State` — not `let`. Without `@State`, SwiftUI may recreate the instance on parent redraws.

**Note**: Mark `@Observable` classes with `@MainActor` for thread safety.

## Property Wrappers Inside @Observable Classes

**Always annotate property-wrapper properties with `@ObservationIgnored` inside `@Observable` classes.**

```swift
@Observable
@MainActor
final class SettingsModel {
    @ObservationIgnored @AppStorage("username") var username = ""
    @ObservationIgnored @AppStorage("isDarkMode") var isDarkMode = false
    var isLoading = false  // Regular stored property works fine
}
```

This applies to `@AppStorage`, `@SceneStorage`, `@Query` (SwiftData), and any other property wrapper.

## Don't Pass Values as @State

**Never declare passed values as `@State` or `@StateObject`. They only accept an initial value and ignore subsequent updates.**

```swift
// WRONG
struct ChildView: View {
    @State var item: Item  // Ignores parent updates!
}

// CORRECT
struct ChildView: View {
    let item: Item  // Or @Binding if child needs to modify
}
```

## @Bindable (iOS 17+)

Use when receiving an `@Observable` object from outside and needing bindings:

```swift
struct EditUserView: View {
    @Bindable var user: UserModel  // Received from parent, needs bindings

    var body: some View {
        TextField("Name", text: $user.name)
    }
}
```

## Environment with @Observable (iOS 17+ — Preferred)

```swift
// Inject
ContentView()
    .environment(AppState())

// Access
struct ChildView: View {
    @Environment(AppState.self) private var appState
}
```

## Custom Environment Values with @Entry

```swift
extension EnvironmentValues {
    @Entry var accentTheme: Theme = .default
}

ContentView()
    .environment(\.accentTheme, customTheme)

struct ThemedView: View {
    @Environment(\.accentTheme) private var theme
}
```

## Decision Flowchart

```
Is this value owned by this view?
├─ YES: Is it a simple value type?
│       ├─ YES → @State private var
│       └─ NO (class):
│           ├─ @Observable → @State private var (mark class @MainActor)
│           └─ Legacy ObservableObject → @StateObject private var
│
└─ NO (passed from parent):
    ├─ Does child need to MODIFY it?
    │   ├─ YES → @Binding var
    │   └─ NO: Does child need BINDINGS to its properties?
    │       ├─ YES (@Observable) → @Bindable var
    │       └─ NO: Does child react to changes?
    │           ├─ YES → var + .onChange()
    │           └─ NO → let
```

## Key Principles

1. Always prefer `@Observable` over `ObservableObject` for new code
2. Mark `@Observable` classes with `@MainActor` for thread safety
3. Use `@State` with `@Observable` classes (not `@StateObject`)
4. Always mark `@State` and `@StateObject` as `private`
5. Never declare passed values as `@State` or `@StateObject`
6. Always add `@ObservationIgnored` to property wrappers inside `@Observable` classes
