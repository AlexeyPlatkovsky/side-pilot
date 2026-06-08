# Front-end Testing — Vitest + React Testing Library

Stack: **Vitest** (runner, Vite-native, fast), **React Testing Library** (RTL), `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` environment.

## Core rules
- **Query by accessibility first:** `getByRole`, `getByLabelText`, `getByText`. Use `getByTestId` only as a last resort.
- **Use `userEvent`, not `fireEvent`**, for interactions (it models real user behavior: focus, key sequences).
- **Async:** use `findBy*` and `waitFor` for state that resolves later; never arbitrary `setTimeout`. Use `await` consistently.
- **Test behavior, not internals:** assert on what's rendered/announced, not component state or prop wiring.
- **Mock judiciously — at the boundary:** mock the Tauri IPC layer (`invoke` / generated `commands`) with `vi.mock`, not internal helpers. Don't mock React.
- Each test is isolated: no shared mutable state between tests; reset mocks in `afterEach` (or `clearMocks: true`).

## side-pilot specifics
- Wrap components under test in their real providers (TanStack Query client, Zustand store) using a small `renderWithProviders` helper.
- For IPC, mock the generated command/`invoke` to return typed fixtures; assert the UI reflects loading → success → error.
- Test the send flow: typing a prompt + pressing Enter triggers the mutation; the response appears; the input clears.
- Test the error path: a rejected IPC call surfaces a visible, accessible error (not a silent failure).
- Assert the `aria-live` region receives the new assistant message.

## Heuristics per component/behavior
- Renders expected content for given props/state (happy path).
- Responds correctly to user interaction (`userEvent`).
- Handles the async/error state from IPC.
- Edge: empty history, very long message, in-flight (disabled send) state.

## Anti-patterns (findings)
- `getByTestId` where a role/label query works.
- `fireEvent` for what should be `userEvent`.
- Asserting on internal state / implementation instead of rendered output.
- Mocking internals rather than the IPC boundary.
- Missing failure-path test for any IPC-driven behavior.
