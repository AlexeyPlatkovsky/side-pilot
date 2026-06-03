# SwiftUI Liquid Glass Reference (iOS 26+)

**Only adopt Liquid Glass when explicitly requested by the user.** Do not proactively convert existing UI to glass effects.

## Availability

All Liquid Glass APIs require iOS 26+. Always provide fallbacks:

```swift
if #available(iOS 26, *) {
    // Liquid Glass implementation
} else {
    content.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
}
```

## Core API

```swift
// Basic usage
Text("Hello")
    .padding()
    .glassEffect()  // .regular style, rect shape

// With shape
Text("Rounded")
    .padding()
    .glassEffect(in: .rect(cornerRadius: 16))

// With tint
.glassEffect(.regular.tint(.blue))

// Interactive (only on tappable elements)
.glassEffect(.regular.interactive(), in: .capsule)
```

**Available styles:** `.regular`, `.clear`, `.identity`

## GlassEffectContainer

**Glass cannot sample other glass.** Wrap grouped elements in `GlassEffectContainer` to give them a shared sampling region:

```swift
GlassEffectContainer(spacing: 16) {
    HStack(spacing: 16) {
        Button("One") { }.glassEffect()
        Button("Two") { }.glassEffect()
    }
}
```

The container's `spacing` parameter should match the layout spacing.

## Modifier Order

Apply `glassEffect` **after** layout and visual modifiers:

```swift
// CORRECT
Text("Label")
    .font(.headline)
    .foregroundStyle(.primary)
    .padding()
    .glassEffect()  // LAST

// WRONG
Text("Label")
    .glassEffect()  // Too early
    .padding()
```

## Morphing Transitions

```swift
@Namespace private var animation
@State private var isExpanded = false

GlassEffectContainer {
    if isExpanded {
        ExpandedCard()
            .glassEffect()
            .glassEffectID("card", in: animation)
    } else {
        CompactCard()
            .glassEffect()
            .glassEffectID("card", in: animation)
    }
}
.animation(.smooth, value: isExpanded)
```

## Glass Button Styles

```swift
Button("Action") { }.buttonStyle(.glass)
Button("Primary") { }.buttonStyle(.glassProminent)
```

## Fallback Strategies

```swift
if #available(iOS 26, *) {
    content.glassEffect()
} else {
    content.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
}
```

**Materials for fallback:** `.ultraThinMaterial` (closest to glass), `.thinMaterial`, `.regularMaterial`, `.thickMaterial`

## Checklist

- [ ] `#available(iOS 26, *)` with material-based fallback
- [ ] `GlassEffectContainer` wraps grouped elements
- [ ] `.glassEffect()` applied after layout modifiers
- [ ] `.interactive()` only on user-interactable elements
- [ ] `glassEffectID` with `@Namespace` for morphing transitions
- [ ] Container spacing matches layout spacing
- [ ] Tint opacity used for emphasis (no `.prominent` style exists)
