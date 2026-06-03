# Writing Better Tests

## Unit Test Hygiene (FIRST)

Good unit tests should be:
- **Fast**: dozens per second or faster
- **Isolated**: don't depend on other tests or external state
- **Repeatable**: always give the same result
- **Self-verifying**: unambiguously pass or fail
- **Timely**: written before or alongside production code

## Structuring Tests

- Organize test types to match production code folder/file structure
- Group related tests into test suites following the same file and folder structure
- Use tags to mark test kinds: `.networking`, `.slow`, `.edgeCase`, `.smoke`
- Put test fixtures in a dedicated `Fixtures` folder

## Testing SwiftUI Views

Never test views directly — they use `@State` and behave unpredictably. Test view models instead. `@Observable` view models are directly testable without a protocol wrapper.

## Expose Hidden Dependencies

Strongly prefer to avoid hidden dependencies (`URLSession.shared`, `UserDefaults.standard`). Use dependency injection with sensible defaults:

```swift
// Before
mutating func fetch() async throws {
    let (data, _) = try await URLSession.shared.data(from: url)  // Hidden dependency
}

// After (injectable, testable)
func fetch(using session: any URLSessionProtocol = URLSession.shared) async throws {
    let (data, _) = try await session.data(from: url)
}
```

For `UserDefaults`, inject a custom suite:

```swift
let suite = "suite-\(UUID().uuidString)"
let userDefaults = UserDefaults(suiteName: suite)
defer { userDefaults?.removePersistentDomain(forName: suite) }
```

## #expect vs #require

- `#expect` — evaluates condition, fails test if false, **continues running**
- `#require` — evaluates condition, fails test if false, **stops the test**

Use `#require` for checking assumptions at the start of a test:

```swift
@Test func outstandingTasksStringIsPlural() throws {
    let sut = try createTestUser(projects: 3, itemsPerProject: 10)
    try #require(sut.projects.isEmpty == false)  // Precondition
    #expect(sut.outstandingTasksString == "30 items")
}
```

`#require` also unwraps optionals:

```swift
let value = try #require(someOptional)
```

## Testing Throws

```swift
// Fine-grained — asserts exact error case
@Test func playingMinecraftThrows() {
    do {
        try game.play()
        Issue.record("Expected an error to be thrown.")
    } catch GameError.notPurchased {
        // success
    } catch {
        Issue.record("Wrong error thrown: \(error)")
    }
}

// Using #expect(throws:) — always name the specific error, not Error.self
#expect(throws: GameError.notInstalled) {
    try game.play()
}

// Asserting no throw
#expect(throws: Never.self) {
    try game.play()
}
```

## Bug Tracking

```swift
@Test("Headings should always be italic", .bug(id: 182))
func headingsAreItalic() { /* ... */ }

@Test("Headings should always be italic", .bug("https://github.com/you/repo/issues/182"))
func headingsAreItalic() { /* ... */ }
```

## Verification Methods with SourceLocation

```swift
func verifyDivision(
    _ result: (quotient: Int, remainder: Int),
    expectedQuotient: Int,
    expectedRemainder: Int,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(result.quotient == expectedQuotient, sourceLocation: sourceLocation)
    #expect(result.remainder == expectedRemainder, sourceLocation: sourceLocation)
}
```

**Important:** Use `#_sourceLocation` (with underscore) — the non-underscore version doesn't exist yet.

## CustomTestStringConvertible

Add retroactive conformances in the test target to improve error output:

```swift
extension GameError: @retroactive CustomTestStringConvertible {
    public var testDescription: String {
        switch self {
        case .notPurchased: "This game has not been purchased."
        case .notInstalled: "This game is not currently installed."
        }
    }
}
```

**Important:** This conformance should not be added in production code.
