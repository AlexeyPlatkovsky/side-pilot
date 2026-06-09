import { defineConfig, devices } from "@playwright/test";

/**
 * WebKit end-to-end harness (SP-0gx).
 *
 * Runs the React UI in Playwright's **WebKit** engine — the closest available
 * approximation to the WKWebView the Tauri app renders in — to catch the
 * runtime-only UI bugs that Vitest + jsdom and Chromium previews cannot
 * (WebKit-specific rendering, layout sizing, scroll/pin, auto-grow, drag-region
 * DOM contracts). This is the automated backbone of the AGENTS.md "Runtime UI
 * validation" quality gate.
 *
 * Scope: WebKit *engine* correctness, not a native OS window — true OS-level
 * window dragging stays a manual check in the real Tauri window.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5175",
    trace: "on-first-retry",
  },
  projects: [
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    {
      name: "chromium-smoke",
      use: { ...devices["Desktop Chrome"] },
      grep: /@chromium-smoke/,
    },
  ],
  // Reuse the project's Vite dev server so tests render the real components.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5175",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
