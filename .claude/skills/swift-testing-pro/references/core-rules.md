# Swift Testing Core Rules

## Organization & Structure

- Prefer structs over classes for test suites unless subclassing or deinitializers are needed
- The `@Suite` annotation is optional; any type containing `@Test` methods automatically becomes a test suite
- Use `@Suite` only when you need to name the suite or attach traits like tags

## Setup & Teardown

Replace XCTest's `setUp()`/`tearDown()` with initializers:

```swift
struct UserTests {
    let sut: User

    init() {
        sut = User(name: "Test")
    }
    // deinit { } for classes if cleanup needed
}
```

## Test Writing

- Drop the "test" prefix — `userCanLogOut()` is perfectly valid
- Tests execute randomly and in parallel; each must be independently executable
- No `#expect` needed for a test to pass; execution without errors succeeds

## Parameterized Tests

```swift
@Test(arguments: [("alice", true), ("", false)])
func validateUsername(name: String, expected: Bool) {
    #expect(User.isValidName(name) == expected)
}
```

**Important:** Two argument collections create a Cartesian product; use `zip()` for pairwise combinations.

## Known Issues

```swift
withKnownIssue("Intermittent network timeout") {
    // failing code
}

// For flaky tests being actively debugged
withKnownIssue(isIntermittent: true) {
    // flaky code
}
```

## Availability

```swift
@Test
@available(macOS 15, *)
func newAPIBehavior() { /* ... */ }
```

Apply `@available` to individual tests, not entire suites.

## Negation

Avoid `!` operators in expectations; use equality checks for better failure diagnostics:

```swift
// BAD
#expect(!items.isEmpty)

// GOOD
#expect(items.count > 0)
// or
#expect(items.isEmpty == false)
```

## Tags

```swift
extension Tag {
    @Tag static var networking: Self
    @Tag static var slow: Self
    @Tag static var edgeCase: Self
}

@Test(.tags(.networking))
func fetchUserData() { /* ... */ }
```
