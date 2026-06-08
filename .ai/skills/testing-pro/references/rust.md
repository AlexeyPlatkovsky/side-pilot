# Rust / Tauri Core Testing — cargo-nextest + tokio + mockall

Stack: **cargo-nextest** (preferred runner; process-per-test isolation, faster), `#[tokio::test]` for async, **`mockall`** for trait-based mocking. `cargo test` remains the fallback (and is required for doctests, which nextest doesn't run).

## Core rules
- **Async tests** use `#[tokio::test]`; pick `flavor = "multi_thread"` only when the test needs real concurrency.
- **Isolate external effects behind traits**, then mock with `mockall`:
  - Subprocess execution (running a CLI) → a `CommandRunner`/`ProcessRunner` trait, mocked in tests; never spawn the real `codex`/`claude`/`gemini` in unit tests.
  - Clock/time (timeouts) → an injectable time source so timeout tests are deterministic.
  - SQLite/storage → test against an in-memory or temp-file database, not the user's real store.
- **Assert errors by variant**, not by string: `assert!(matches!(err, AdapterError::TimedOut))`, not substring matching on a message.
- **Determinism / nextest-friendliness:** no shared mutable global state across tests; each test sets up its own fixtures. Avoid ordering dependencies (nextest runs tests in separate processes).
- Unit tests live in `#[cfg(test)] mod tests` next to the code; cross-module/integration tests live in `tests/`.

## side-pilot specifics (adapters, routing, storage, commands)
- **CLI adapter** tests cover: command/argument construction (correct binary + flags like `codex exec --json -s read-only`), parsing of the structured output into the typed result, mapping of failures to the `AdapterError` taxonomy (binaryNotFound / notAuthenticated / nonZeroExit / timedOut / outputParseFailure / cancelled), timeout behavior, and cancellation — all with a mocked runner.
- **Routing layer** tests cover: a request routes to the correct adapter; unknown/!registered targets error cleanly.
- **Storage** tests cover: messages persist and read back; session references (`codex_session_id`) round-trip — against a temp DB.
- **Tauri commands** stay thin; test the underlying plain function, not the `#[tauri::command]` wrapper.

## Heuristics per function/behavior
- Happy path (correct output).
- Boundary/edge inputs (empty prompt, large output).
- Error path (each mapped `AdapterError` variant has a test).
- Async cancellation / timeout (deterministic via injected time + mocked runner).

## Anti-patterns (findings)
- Spawning real CLI binaries or hitting the real filesystem/DB in unit tests.
- Matching errors by message string instead of variant.
- Shared global mutable state or test ordering dependence.
- `#[test]` on an async fn (won't compile/await correctly) instead of `#[tokio::test]`.
- Timeout tests that rely on real wall-clock sleeps (flaky).
