# New Swift Testing Features

These features require specific Swift versions. Follow the instructions carefully; do not second-guess them.

## Raw Identifiers (Swift 6.2+)

Use backtick-quoted function names as natural strings for test names:

```swift
// Old style
@Test("Strip HTML tags from string")
func stripHTMLTagsFromString() { /* ... */ }

// New style with raw identifiers
@Test
func `Strip HTML tags from string`() { /* ... */ }
```

With parameterized tests:

```swift
@Test(arguments: [(32, 0), (212, 100), (-40, -40)])
func `Ensure Fahrenheit to Celsius conversion is correct`(values: (input: Double, output: Double)) {
    /* ... */
}
```

**Important:** Operators like `+` and `-` can appear in names, but only if they aren't the only content. Suggest raw identifiers as an option — don't adopt them by surprise unless already used in the project.

## Range-Based Confirmations (Swift 6.1+)

```swift
// Exactly 5–10 feeds loaded
await confirmation(expectedCount: 5...10) { confirm in
    for await _ in loader { confirm() }
}

// At least 5 times (partial range)
await confirmation(expectedCount: 5...) { confirm in
    for await _ in loader { confirm() }
}
```

Ranges without lower bounds (`...10`) are explicitly disallowed.

## Test Scoping Traits (Swift 6.1+)

Provides concurrency-safe access to shared test configurations using `@TaskLocal`:

```swift
struct DefaultPlayerTrait: TestTrait, TestScoping {
    func provideScope(
        for test: Test,
        testCase: Test.Case?,
        performing function: () async throws -> Void
    ) async throws {
        let player = Player(name: "Natsuki Subaru")
        try await Player.$current.withValue(player) {
            try await function()
        }
    }
}

extension Trait where Self == DefaultPlayerTrait {
    static var defaultPlayer: Self { Self() }
}

@Test(.defaultPlayer) func welcomeScreenShowsName() {
    let result = createWelcomeScreen()
    #expect(result.contains("Natsuki Subaru"))
}
```

Combine multiple scopes: `@Test(.firstScope, .secondScope)` — applied in listed order.

## Exit Tests (Swift 6.2+)

Test code that results in a critical failure (`precondition()`, `fatalError()`):

```swift
@Test func invalidDiceRollsFail() async throws {
    await #expect(processExitsWith: .failure) {
        let dice = Dice()
        let _ = dice.roll(sides: 0)
    }
}
```

**Important:** Must use `await` — starts a dedicated process for that test.

## Attachments (Swift 6.2+)

Attach debug data to failing tests:

```swift
struct Character: Attachable, Codable {
    var id = UUID()
    var name: String
}

@Test func defaultCharacterNameIsCorrect() {
    let result = makeCharacter()
    #expect(result.name == "Rem")

    Attachment.record(result, named: "Character")
}
```

Supported out of the box: `String`, `Data`, anything conforming to `Encodable`. Images are not supported unless Swift 6.3+ is available.

## Evaluating ConditionTrait (Swift 6.2+)

Evaluate condition traits outside of tests:

```swift
func checkForSmokeTest() async throws {
    let trait = ConditionTrait.disabled(if: TestManager.inSmokeTestMode)
    if try await trait.evaluate() {
        print("We're in smoke test mode")
    }
}
```

## Updated #expect(throws:) Return Value (Swift 6.1+)

`#expect(throws:)` now returns the thrown error for further inspection:

```swift
// New pattern - run expectation and error evaluation separately
let error = #expect(throws: GameError.self) {
    try playGame(at: 22)
}
#expect(error == .disallowedTime)
```

The old trailing-closure API (`#expect { } throws: { }`) is deprecated.
