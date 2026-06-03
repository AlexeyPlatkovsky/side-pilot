# SwiftUI Performance Patterns Reference

## 1. Avoid Redundant State Updates

```swift
// GOOD - only update when different
.onReceive(publisher) { value in
    if self.currentValue != value {
        self.currentValue = value
    }
}
```

## 2. Optimize Hot Paths

```swift
// GOOD - only update when threshold crossed
.onPreferenceChange(ScrollOffsetKey.self) { offset in
    let shouldShow = offset.y <= -32
    if shouldShow != shouldShowTitle {
        shouldShowTitle = shouldShow
    }
}
```

## 3. Pass Only What Views Need

Avoid passing large "config" or "context" objects. Pass only the specific values each view needs.

## 4. Equatable Views for Expensive Bodies

```swift
struct ExpensiveView: View, Equatable {
    let data: SomeData

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.data.id == rhs.data.id
    }

    var body: some View { /* expensive */ }
}

ExpensiveView(data: data).equatable()
```

## 5. POD Views for Fast Diffing

A view is POD if it only contains simple value types and no property wrappers — SwiftUI uses `memcmp` for fastest diffing.

## 6. Lazy Loading

```swift
// GOOD
ScrollView {
    LazyVStack {
        ForEach(items) { item in
            ExpensiveRow(item: item)
        }
    }
}
```

**iOS 26+**: Nested scroll views containing lazy stacks now automatically defer loading until they're about to appear.

## 7. Debug View Updates

```swift
var body: some View {
    #if DEBUG
    let _ = Self._logChanges()
    #endif
    /* content */
}
```

`Self._printChanges()`: prints to stdout.
`Self._logChanges()` (iOS 17+): logs to `com.apple.SwiftUI` subsystem.

## 8. @Observable Dependency Granularity

Consider per-item `@Observable` state holders (one per row) to narrow update scope. Changing one element in a shared array causes all items to re-evaluate:

```swift
// GOOD - each item has its own observable view model
@Observable
class LandmarkViewModel {
    var isFavorite: Bool = false
}
```

## 9. Off-Main-Thread Closures

SwiftUI may call certain closures on a background thread. Capture needed values explicitly:

```swift
// GOOD
.visualEffect { [pulse] content, geometry in
    content.blur(radius: pulse ? 5 : 0)
}
```

Applies to: `Shape.path(in:)`, `visualEffect` closure, `Layout` protocol methods, `onGeometryChange` transform closure.

## Anti-Patterns

### Creating Objects in Body

```swift
// BAD
var body: some View {
    let formatter = DateFormatter()  // recreated every body call!
}

// GOOD
private static let dateFormatter: DateFormatter = {
    let f = DateFormatter()
    f.dateStyle = .long
    return f
}()
```

### Heavy Computation in Body

Move sorting, filtering, and formatting into models or computed properties. The `body` should be a pure structural representation of state.

## Summary Checklist

- [ ] State updates check for value changes before assigning
- [ ] Hot paths minimize state updates
- [ ] Pass only needed values to views
- [ ] Large lists use `LazyVStack`/`LazyHStack`
- [ ] No object creation in `body`
- [ ] Heavy computation moved out of `body`
- [ ] Derived state computed, not stored
- [ ] Use `Self._logChanges()` to debug unexpected updates
- [ ] Frequently-changing values not stored in the environment
- [ ] Sendable closures (Shape, visualEffect, Layout) capture values instead of accessing @MainActor state
