# SwiftUI Layout Best Practices Reference

## Relative Layout Over Constants

Use dynamic layout calculations instead of hard-coded values. Hard-coded values don't adapt to screen sizes, orientations, or dynamic content.

## Context-Agnostic Views

Views should work in any context — as full screens, modals, sheets, popovers, or embedded content. Never use `UIScreen.main.bounds` directly.

## Full-Width Views

```swift
// GOOD - frame modifier
Text("Hello")
    .frame(maxWidth: .infinity, alignment: .leading)

// AVOID - unnecessary stack and spacer
HStack {
    Text("Hello")
    Spacer()
}
```

## Layout Performance

### Avoid Layout Thrash

Minimize deep view hierarchies and excessive layout dependencies. Avoid multiple nested `GeometryReader` instances.

**Gate frequent geometry updates:**

```swift
.onPreferenceChange(ViewSizeKey.self) { size in
    let difference = abs(size.width - currentSize.width)
    if difference > 10 {
        currentSize = size
    }
}
```

## Keep Business Logic in Services and Models

Views should be simple and declarative. Business logic belongs in services/models where it's independently testable.

```swift
@Observable
final class AuthService {
    var email = ""
    var password = ""
    var isValid: Bool {
        !email.isEmpty && password.count >= 8
    }
    func login() async throws { /* testable without the view */ }
}
```

## Action Handlers

```swift
// GOOD - action references method
Button("Publish Project", action: publishService.handlePublish)

// AVOID - multi-line logic in closure
Button("Publish Project") {
    isLoading = true
    apiService.publish(project) { /* ... */ }
}
```

## Summary Checklist

- [ ] Use relative layout over hard-coded constants
- [ ] Views work in any context (don't assume screen size)
- [ ] Avoid deep view hierarchies
- [ ] Gate frequent geometry updates by thresholds
- [ ] Business logic in services and models
- [ ] Action handlers reference methods, not inline logic
- [ ] Use `.frame(maxWidth: .infinity, alignment:)` for full-width views
- [ ] Avoid excessive `GeometryReader` usage
- [ ] Use `containerRelativeFrame()` when appropriate (iOS 17+)
