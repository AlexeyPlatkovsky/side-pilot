# SwiftUI Advanced Animations

## Phase Animations (iOS 17+)

Cycle through discrete phases automatically:

```swift
// Triggered phase animation
Button("Shake") { trigger += 1 }
    .phaseAnimator(
        [0.0, -10.0, 10.0, -5.0, 5.0, 0.0],
        trigger: trigger
    ) { content, offset in
        content.offset(x: offset)
    }

// Infinite loop (no trigger)
Circle()
    .phaseAnimator([1.0, 1.2, 1.0]) { content, scale in
        content.scaleEffect(scale)
    }
```

**Prefer enum phases for clarity:**

```swift
enum BouncePhase: CaseIterable {
    case initial, up, down, settle

    var scale: CGFloat {
        switch self {
        case .initial: 1.0; case .up: 1.2; case .down: 0.9; case .settle: 1.0
        }
    }
}

Circle().phaseAnimator(BouncePhase.allCases, trigger: trigger) { content, phase in
    content.scaleEffect(phase.scale)
}
```

## Keyframe Animations (iOS 17+)

Precise timing control with exact values at specific times:

```swift
Button("Bounce") { trigger += 1 }
    .keyframeAnimator(
        initialValue: AnimationValues(),
        trigger: trigger
    ) { content, value in
        content
            .scaleEffect(value.scale)
            .offset(y: value.verticalOffset)
    } keyframes: { _ in
        KeyframeTrack(\.scale) {
            SpringKeyframe(1.2, duration: 0.15)
            SpringKeyframe(0.9, duration: 0.1)
            SpringKeyframe(1.0, duration: 0.15)
        }
        KeyframeTrack(\.verticalOffset) {
            LinearKeyframe(-20, duration: 0.15)
            LinearKeyframe(0, duration: 0.25)
        }
    }

struct AnimationValues {
    var scale: CGFloat = 1.0
    var verticalOffset: CGFloat = 0
}
```

**Keyframe Types:** `CubicKeyframe`, `LinearKeyframe`, `SpringKeyframe`, `MoveKeyframe` (instant jump).

Tracks run **in parallel**, each animating one property.

## Animation Completion Handlers (iOS 17+)

```swift
// One-shot completion
withAnimation(.spring) {
    isExpanded.toggle()
} completion: {
    showNextStep = true
}

// Completion that fires on every trigger change
Circle()
    .transaction(value: bounceCount) { transaction in
        transaction.animation = .spring
        transaction.addAnimationCompletion {
            message = "Bounce \(bounceCount) complete"
        }
    }
```

**Note:** Without `value:` parameter, completion only fires once ever.

## @Animatable Macro (iOS 26+)

Auto-synthesizes `animatableData` from all animatable stored properties:

```swift
// BEFORE (manual)
struct Wedge: Shape {
    var startAngle: Angle
    var endAngle: Angle
    var drawClockwise: Bool

    var animatableData: AnimatablePair<Double, Double> {
        get { AnimatablePair(startAngle.radians, endAngle.radians) }
        set {
            startAngle = .radians(newValue.first)
            endAngle = .radians(newValue.second)
        }
    }
}

// AFTER (@Animatable)
@Animatable
struct Wedge: Shape {
    var startAngle: Angle
    var endAngle: Angle
    @AnimatableIgnored var drawClockwise: Bool
}
```

Use `@AnimatableIgnored` for properties that control behavior but should not interpolate.

## Quick Reference

- **Phase Animations**: Multi-step sequences returning to start; prefer over manual DispatchQueue timing
- **Keyframe Animations**: Precise timing; tracks run in parallel; prefer over DispatchQueue
- **Completion Handlers**: Use `withAnimation { } completion: { }` for one-shot; `.transaction(value:)` for repeating
- **@Animatable Macro**: Replaces verbose manual `animatableData` getters/setters (iOS 26+)
