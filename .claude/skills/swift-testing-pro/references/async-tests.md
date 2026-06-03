# Async Tests

## Serializing Tests

`.serialized` only works on parameterized tests (and whole suites). It has **no effect on non-parameterized tests**:

```swift
// Works - serializes parameterized test cases
@Test(.serialized, arguments: [1, 2, 3])
func processItem(_ item: Int) async { /* ... */ }

// Works - serializes all tests in the suite
@Suite(.serialized)
struct DatabaseTests { /* ... */ }
```

## Confirming Async Work

`confirmation(expectedCount:)` requires that all tested code has **finished executing fully** by the time the `confirmation()` closure finishes. Completion closures will make tests fail.

**Wrong pattern (Task-based):**

```swift
// BAD - confirmation() doesn't know to wait for the Task
struct Worker {
    func run(_ work: @escaping () -> Void) -> Task<Void, Never> {
        Task { work() }
    }
}
```

**Fix option 1 — make it async:**

```swift
struct Worker {
    func run(_ work: @escaping () -> Void) async {
        work()
    }
}

@Test func workerRunsThreeTimes() async {
    let worker = Worker()
    await confirmation(expectedCount: 3) { confirm in
        for _ in 0..<3 {
            await worker.run { }
            confirm()
        }
    }
}
```

**Fix option 2 — return the Task:**

```swift
// Await the task before calling confirm()
let task = worker.run { }
await task.value
confirm()
```

**Note:** `confirmation(expectedCount: 0)` is valid — "ensure the event never happens."

## Time Limits

Use `.timeLimit(.minutes(N))` — **not seconds**:

```swift
@Test("Loading view model names", .timeLimit(.minutes(1)))
func loadNames() async {
    let viewModel = ViewModel()
    await viewModel.loadNames()
    #expect(viewModel.names.isEmpty == false)
}
```

When applied to a whole suite, the limit applies to each test individually. The shorter of two conflicting limits wins.

## Actor Isolation

```swift
// Individual test on main actor
@MainActor
@Test func loadNames() async { /* ... */ }

// Whole suite on main actor
@MainActor
struct DataHandlingTests {
    @Test func loadNames() async { /* ... */ }
}

// confirmation/withKnownIssue with specific actor
await withKnownIssue("Known issue", isolation: MainActor.shared) {
    // test code
}
```

## Testing Pre-Concurrency Code (Callback-Based)

Do not modernize existing callback-based production code without permission. Use `withCheckedContinuation()`:

```swift
@Test func loadReadings() async {
    let viewModel = ViewModel()

    await withCheckedContinuation { continuation in
        viewModel.loadReadings { readings in
            #expect(readings.count >= 10)
            continuation.resume()
        }
    }
}
```

## Mocking Networking

Unit tests should never do live networking. Create a protocol for `URLSession`:

```swift
protocol URLSessionProtocol {
    func data(from url: URL) async throws -> (Data, URLResponse)
}

extension URLSession: URLSessionProtocol { }

class URLSessionMock: URLSessionProtocol {
    var testData: Data?
    var testError: (any Error)?

    func data(from url: URL) async throws -> (Data, URLResponse) {
        if let testError { throw testError }
        return (testData ?? Data(), URLResponse())
    }
}

@Test func newsStoriesAreFetched() async throws {
    var news = News(url: URL(string: "https://example.com")!)
    let session = URLSessionMock()
    session.testData = Data("Hello, world!".utf8)
    try await news.fetch(using: session)
    #expect(news.stories == "Hello, world!")
}
```
