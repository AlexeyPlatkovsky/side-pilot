# SwiftUI Animation Basics

## Implicit Animations

Use `.animation(_:value:)` — **always include the value parameter**:

```swift
// GOOD
Rectangle()
    .frame(width: isExpanded ? 200 : 100, height: 50)
    .animation(.spring, value: isExpanded)

// BAD - deprecated
Rectangle()
    .animation(.spring)  // Deprecated!
```

## Explicit Animations

```swift
// GOOD
Button("Toggle") {
    withAnimation(.spring) { isExpanded.toggle() }
}

// When to use which:
// Implicit - animations tied to specific value changes
// Explicit - event-driven animations (button taps, gestures)
```

## Animation Placement

Place animation modifiers **after** the properties they animate:

```swift
Rectangle()
    .frame(width: isExpanded ? 200 : 100, height: 50)
    .foregroundStyle(isExpanded ? .blue : .red)
    .animation(.default, value: isExpanded)  // After properties
```

## Selective Animation

```swift
Rectangle()
    .frame(width: isExpanded ? 200 : 100, height: 50)
    .animation(.spring, value: isExpanded)    // Animate size
    .foregroundStyle(isExpanded ? .blue : .red)
    .animation(nil, value: isExpanded)         // Don't animate color
```

## Timing Curves

| Curve | Use Case |
|-------|----------|
| `.spring` | Interactive elements, most UI |
| `.easeInOut` | Appearance changes |
| `.bouncy` | Playful feedback (iOS 17+) |
| `.linear` | Progress indicators only |

```swift
.animation(.default.speed(2.0), value: flag)   // 2x faster
.animation(.default.delay(0.5), value: flag)    // Delayed start
```

## Animation Performance

Prefer transforms over layout changes (GPU accelerated):

```swift
// GOOD - GPU accelerated
.scaleEffect(isActive ? 1.5 : 1.0)
.offset(x: isActive ? 50 : 0)
.rotationEffect(.degrees(isActive ? 45 : 0))

// BAD - layout changes are expensive
.frame(width: isActive ? 150 : 100)
.padding(isActive ? 50 : 0)
```

## Disabling Animations

```swift
Text("Count: \(count)")
    .transaction { $0.animation = nil }
```

## Quick Reference

### Do
- Use `.animation(_:value:)` with value parameter
- Use `withAnimation` for event-driven animations
- Prefer transforms over layout changes
- Scope animations narrowly

### Don't
- Use deprecated `.animation(_:)` without value
- Apply broad animations at root level
- Use linear timing for UI (feels robotic)
- Animate on every frame in scroll handlers
