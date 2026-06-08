# testing-taxonomy.md

## Purpose

Single authoritative source for the project test taxonomy: level definitions, scope boundaries, tool assignments, directory conventions, and quality practice standards. All instruction artifacts reference this convention; none duplicate its content.

## Test Pyramid and Levels

All test code must target the correct level per the following taxonomy:

| Level | Scope | Tools | Directory |
|-------|-------|-------|-----------|
| **Unit** | Pure functions, reducers, helpers | Vitest / cargo-nextest | `src/**/*.test.{ts,tsx}`, `#[cfg(test)]` |
| **Component** | Single React component with mocked IPC | Vitest + RTL + userEvent | `src/components/*.test.tsx` |
| **Integration** | Store + registry pipeline, Tauri command layer | cargo-nextest (Rust) | `src-tauri/tests/` |
| **Contract** | IPC shape validation, round-trip serde | Vitest / cargo test | `src/chat/contract.test.ts`, Rust inline |
| **E2E** | Full UI in WebKit engine | Playwright WebKit | `e2e/*.spec.ts` |
| **A11y** | Accessibility axe audits | jest-axe / @axe-core/playwright | `*.a11y.test.tsx`, `e2e/a11y.spec.ts` |
| **Property** | Randomized invariant verification | fast-check / proptest | `*.proptest.ts`, Rust inline |

## Additional Quality Practices

- **Coverage thresholds** enforced via `@vitest/coverage-v8` (80% lines, branches, functions, statements).
- **Dependency auditing** via `npm audit --production` and `cargo audit`.
- **Smoke tests** tag critical-path tests with `[smoke]` (Vitest) or `@smoke` (Playwright).
- **Property-based testing** for parsing, stripping, and reduction functions. Use `fast-check` (TS) and `proptest` (Rust).
- **Accessibility testing** via `jest-axe` for components and `@axe-core/playwright` for E2E.
- **Mutation testing** validates test quality on `feature/*` branches. Stryker-js + cargo-mutants.
- **Contract tests** verify round-trip serialization for all IPC types and that generated TypeScript bindings match the Rust source of truth.
- **Static analysis** uses `typescript-eslint stylisticTypeChecked` rules, `eslint-plugin-testing-library`, and `clippy::pedantic`.

## Selection Heuristics

| What's being tested | Level | Example location |
|---------------------|-------|-----------------|
| Pure function (parser, reducer, helper) | Unit | `src/state/chat.test.ts`, `#[cfg(test)]` |
| Single React component | Component | `src/components/Bubble.test.tsx` |
| Store + adapter + routing pipeline | Integration | `src-tauri/tests/integration_store_routing.rs` |
| IPC type round-trip | Contract | `src/chat/contract.test.ts` |
| Full UI in WebKit | E2E | `e2e/composer.spec.ts` |
| Accessibility audit | A11y | `src/components/Bubble.a11y.test.tsx` |
| Invariant over random inputs | Property | `src/**/*.proptest.ts` |
