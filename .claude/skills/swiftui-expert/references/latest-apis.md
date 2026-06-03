# Latest SwiftUI APIs — Deprecated → Modern

**Read this file first for every task.** Maps deprecated APIs to their modern replacements across iOS 15–26.

## iOS 15+ (Always Use These)

**Navigation & UI Basics:**
- Replace `navigationBarTitle(_:)` with `navigationTitle(_:)`
- Use `toolbar { ToolbarItem(...) }` instead of `navigationBarItems(...)`
- Prefer `toolbarVisibility(.hidden, for: .navigationBar)` over `navigationBarHidden(_:)`
- Swap `ignoresSafeArea(_:edges:)` for `edgesIgnoringSafeArea(_:)`

**Styling & Appearance:**
- `foregroundStyle(_:)` replaces `foregroundColor(_:)`
- `clipShape(.rect(cornerRadius:))` supersedes `cornerRadius()`
- `preferredColorScheme(_:)` modernizes `colorScheme(_:)`
- Fill and stroke shapes with chained modifiers (no overlay needed)

**Input & Accessibility:**
- Use `textInputAutocapitalization(_:)` instead of `autocapitalization(_:)`
- Employ `onSubmit(of:_:)` and `focused(_:equals:)` rather than TextField callbacks
- Use `accessibilityLabel()` instead of generic `accessibility(label:)`

**Dialogs:**
- `confirmationDialog(_:isPresented:actions:message:)` replaces action sheets
- Modern alert syntax: `alert(_:isPresented:actions:message:)`

**State & Environment:**
- The `@Entry` macro replaces ~10 lines of EnvironmentKey boilerplate
- Reference asset catalog images via generated symbol API: `Image(.avatar)`
- Use `ForEach(items.enumerated(), id: \.element.id)` without converting to array
- Hide scroll indicators with `.scrollIndicators(.hidden)`
- When using `ObservableObject`, ensure `import Combine` is included
- Use `sensoryFeedback()` for haptic effects over UIKit alternatives

**Text & Content:**
- Employ text interpolation instead of `Text` concatenation with `+`
- Use automatic grammar agreement: `"^[\(people) person](inflect: true)"`

## iOS 16+

- `NavigationStack` and `NavigationSplitView` supersede `NavigationView`
- `tint(_:)` modernizes `accentColor(_:)`
- Use `PasteButton` for user-initiated paste operations
- Replace `.navigationBarLeading/Trailing` with `.topBarLeading/Trailing`
- Use the `Tab` API instead of `tabItem()` (formalized in iOS 18)

## iOS 17+

- `@Observable` replaces `ObservableObject` for new code
- `onChange(of:) { oldValue, newValue in }` replaces deprecated `onChange(of:perform:)`
- Never use single-parameter `onChange()` modifier; use two-parameter or zero-parameter variant
- `sensoryFeedback(_:trigger:)` handles haptics declaratively
- `MagnifyGesture` and `RotateGesture` rename older gesture types
- Consider `containerRelativeFrame()` or `visualEffect()` as `GeometryReader` alternatives
- Avoid `GeometryReader` when `containerRelativeFrame()`, `visualEffect()`, or the `Layout` protocol work instead

## iOS 18+

- New `Tab` API replaces `.tabItem(_:)`
- `@Previewable` enables dynamic properties in previews
- Use `@Entry` macro for custom environment, focus, transaction, and container values

## iOS 26+

- Liquid Glass effects (`.glassEffect()`, `GlassEffectContainer`) — use only on explicit request
- `WebView` available via `import WebKit`
- `@Animatable` macro synthesizes `animatableData` automatically
- `Chart3D` for three-dimensional data visualization
- Scroll edge styling, enhanced tab bars, toolbar spacing controls

## Quick Lookup Table

| Deprecated | Modern | Since |
|---|---|---|
| `foregroundColor(_:)` | `foregroundStyle(_:)` | iOS 15 |
| `cornerRadius(_:)` | `clipShape(.rect(cornerRadius:))` | iOS 15 |
| `navigationBarTitle(_:)` | `navigationTitle(_:)` | iOS 15 |
| `navigationBarItems(...)` | `toolbar { ToolbarItem(...) }` | iOS 15 |
| `navigationBarHidden(_:)` | `toolbarVisibility(.hidden, for: .navigationBar)` | iOS 15 |
| `edgesIgnoringSafeArea(_:)` | `ignoresSafeArea(_:edges:)` | iOS 15 |
| `autocapitalization(_:)` | `textInputAutocapitalization(_:)` | iOS 15 |
| `accentColor(_:)` | `tint(_:)` | iOS 16 |
| `NavigationView` | `NavigationStack` / `NavigationSplitView` | iOS 16 |
| `.navigationBarLeading/Trailing` | `.topBarLeading/Trailing` | iOS 16 |
| `ObservableObject` + `@Published` | `@Observable` macro | iOS 17 |
| `onChange(of:perform:)` | `onChange(of:) { old, new in }` | iOS 17 |
| `tabItem(_:)` | `Tab` API | iOS 18 |
| Manual `animatableData` | `@Animatable` macro | iOS 26 |
