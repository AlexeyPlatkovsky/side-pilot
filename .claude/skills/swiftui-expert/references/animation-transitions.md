# SwiftUI Transitions

## Critical: Transitions Require Animation Context

```swift
// GOOD - animation outside conditional
VStack {
    Button("Toggle") { showDetail.toggle() }
    if showDetail {
        DetailView().transition(.slide)
    }
}
.animation(.spring, value: showDetail)

// BAD - animation inside conditional (removed with view!)
if showDetail {
    DetailView()
        .transition(.slide)
        .animation(.spring, value: showDetail)  // Won't work on removal!
}
```

## Built-in Transitions

| Transition | Effect |
|------------|--------|
| `.opacity` | Fade in/out (default) |
| `.scale` | Scale up/down |
| `.slide` | Slide from leading edge |
| `.move(edge:)` | Move from specific edge |
| `.offset(x:y:)` | Move by offset amount |

```swift
// Combining transitions
.transition(.slide.combined(with: .opacity))
```

## Asymmetric Transitions

```swift
if showCard {
    CardView()
        .transition(
            .asymmetric(
                insertion: .scale.combined(with: .opacity),
                removal: .move(edge: .bottom).combined(with: .opacity)
            )
        )
}
```

## Custom Transitions (iOS 17+)

```swift
struct BlurTransition: Transition {
    var radius: CGFloat

    func body(content: Content, phase: TransitionPhase) -> some View {
        content
            .blur(radius: phase.isIdentity ? 0 : radius)
            .opacity(phase.isIdentity ? 1 : 0)
    }
}

.transition(BlurTransition(radius: 10))
```

## The Animatable Protocol

Enables custom property interpolation. **Always implement `animatableData` explicitly** — missing it causes silent failure (animation jumps to final value):

```swift
struct ShakeModifier: ViewModifier, Animatable {
    var shakeCount: Double

    var animatableData: Double {
        get { shakeCount }
        set { shakeCount = newValue }
    }

    func body(content: Content) -> some View {
        content.offset(x: sin(shakeCount * .pi * 2) * 10)
    }
}
```

For multiple properties, use `AnimatablePair<A, B>`.

## Quick Reference

### Do
- Place transitions outside conditional structures
- Use `withAnimation` or `.animation` outside the `if`
- Implement `animatableData` explicitly for custom Animatable
- Use asymmetric transitions when insert/remove need different effects

### Don't
- Put animation modifiers inside conditionals for transitions
- Forget `animatableData` implementation (silent failure)
- Expect property animation when view identity changes
