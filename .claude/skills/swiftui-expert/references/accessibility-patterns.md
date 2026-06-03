# SwiftUI Accessibility Patterns Reference

## Core Principle

Prefer `Button` over `onTapGesture` for tappable elements. `Button` provides VoiceOver support, focus handling, and proper traits for free.

## Dynamic Type and @ScaledMetric

Use built-in text styles (`.largeTitle`, `.title`, `.body`, `.caption`, etc.) which scale automatically. For custom fonts:

```swift
Text("Article")
    .font(.custom("SourceSerif4-Semibold", size: 28, relativeTo: .title2))
```

For non-text numeric values (padding, spacing, image sizes), use `@ScaledMetric`:

```swift
struct ProfileHeader: View {
    @ScaledMetric private var avatarSize = 60.0
    @ScaledMetric(relativeTo: .body) private var iconSize = 18.0
}
```

## Decorative Images

```swift
// Asset image — purely decorative
Image(decorative: "confetti")

// SF Symbol — decorative
Image(systemName: "sparkles")
    .accessibilityHidden(true)

// Informative
Image("receipt")
    .accessibilityLabel("Receipt")
```

## Element Grouping

```swift
// .combine - auto-join child labels
HStack {
    Image(systemName: "star.fill")
    Text("Favorites")
}
.accessibilityElement(children: .combine)

// .ignore - manual label for container
HStack { Text(item.name); Spacer(); Text(item.price) }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(item.name), \(item.price)")
```

## Custom Controls

```swift
// Adjustable (increment/decrement)
PageControl(selectedIndex: $selectedIndex, pageCount: pageCount)
    .accessibilityElement()
    .accessibilityValue("Page \(selectedIndex + 1) of \(pageCount)")
    .accessibilityAdjustableAction { direction in
        switch direction {
        case .increment: guard selectedIndex < pageCount - 1 else { break }; selectedIndex += 1
        case .decrement: guard selectedIndex > 0 else { break }; selectedIndex -= 1
        @unknown default: break
        }
    }

// Representing as native control
HStack { Text(label); Toggle("", isOn: $isOn) }
    .accessibilityRepresentation { Toggle(label, isOn: $isOn) }
```

## Summary Checklist

- [ ] Use `Button` instead of `onTapGesture` for tappable elements
- [ ] Use built-in text styles or Dynamic Type-aware custom fonts
- [ ] Use `@ScaledMetric` for custom values that should scale with Dynamic Type
- [ ] Mark purely decorative images as decorative or hidden
- [ ] Group related elements with `accessibilityElement(children:)`
- [ ] Provide `accessibilityLabel` when default labels are unclear
- [ ] Use `accessibilityRepresentation` for custom controls
- [ ] Use `accessibilityAdjustableAction` for increment/decrement controls
