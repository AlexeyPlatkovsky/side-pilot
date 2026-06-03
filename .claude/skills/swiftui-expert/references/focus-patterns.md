# SwiftUI Focus Patterns Reference

## @FocusState

Always mark `@FocusState` as `private`. Use `Bool` for a single field, optional `Hashable` enum for multiple.

```swift
// Single field
@FocusState private var isFocused: Bool
TextField("Email", text: $email).focused($isFocused)

// Multiple fields
enum Field: Hashable { case name, email, password }
@FocusState private var focusedField: Field?

TextField("Name", text: $name).focused($focusedField, equals: .name)
TextField("Email", text: $email).focused($focusedField, equals: .email)
```

Set `focusedField = .email` to move focus; set `nil` to dismiss keyboard.

## Making Views Focusable

```swift
struct SelectableCard: View {
    @FocusState private var isFocused: Bool

    var body: some View {
        CardContent()
            .focusable()
            .focused($isFocused)
            .border(isFocused ? Color.accentColor : .clear)
            .onDeleteCommand { deleteCard() }
    }
}
```

## Default Focus (iOS 17+, macOS 13+)

Prefer `.defaultFocus` over setting `@FocusState` in `onAppear`:

```swift
VStack {
    TextField("Name", text: $name).focused($focusedField, equals: .name)
    TextField("Email", text: $email).focused($focusedField, equals: .email)
}
.defaultFocus($focusedField, .email)
```

## Focused Values for Commands

```swift
// Declare
extension FocusedValues {
    @Entry var selectedDocument: Binding<Document>?
}

// Publish from view
.focusedValue(\.selectedDocument, $document)
// .focusedSceneValue for scene-scoped

// Consume in commands
@FocusedBinding(\.selectedDocument) var document
```

## Common Pitfalls

### Redundant @FocusState writes revoke focus

`.focusable()` + `.focused()` handles focus-on-click natively. Adding a tap gesture that also writes to `@FocusState` causes double evaluation, revoking focus:

```swift
// WRONG
CardView()
    .focusable()
    .focused($isFocused)
    .onTapGesture { isFocused = true }  // Remove this

// CORRECT
CardView()
    .focusable()
    .focused($isFocused)
```

### @FocusState vs .onAppear timing

Setting `@FocusState` in `.onAppear` may fail if the view tree hasn't settled. Prefer `.defaultFocus` (iOS 17+).
