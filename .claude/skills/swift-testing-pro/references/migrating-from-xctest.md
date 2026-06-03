# Migrating from XCTest

Do **not** rewrite existing XCTest tests to Swift Testing unless explicitly requested. XCTest is still required for UI tests — Swift Testing does not support them.

## Assertion Mappings

| XCTest | Swift Testing |
|--------|--------------|
| `XCTAssertEqual(a, b)` | `#expect(a == b)` |
| `XCTAssertLessThan(a, b)` | `#expect(a < b)` |
| `XCTAssertThrowsError` | `#expect(throws:)` |
| `XCTUnwrap(optional)` | `try #require(optional)` |
| `XCTFail("message")` | `Issue.record("message")` |
| `XCTAssertIdentical(a, b)` | `#expect(a === b)` |

## Floating-Point Tolerance

Swift Testing has **no** built-in float tolerance. Use Apple's Swift Numerics library:

```swift
import Numerics

#expect(celsius.isApproximatelyEqual(to: 0, absoluteTolerance: 0.000001))
```

**Important:** Do not add Swift Numerics without first requesting permission from the user unless it is already imported.

## Conversion Steps

1. Keep the same broad structure: same type names (class → struct), same test methods (remove `test` prefix, add `@Test`)
2. Switch from old-style assertions to new-style `#expect`/`#require`
3. Look for places where parameterized tests can reduce code or improve coverage
4. Add `#require` checks at the start of tests for preconditions
5. Add appropriate traits: `.timeLimit()`, `.enabled(if:)`, `.tags()`, etc.
