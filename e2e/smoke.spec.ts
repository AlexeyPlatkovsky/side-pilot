import { test, expect } from "@playwright/test";

// Smoke test (SP-0gx.1): the chat panel renders and the composer is reachable.
// Proves the harness boots the real UI before the behavioural regression tests
// build on it. Runs in WebKit (primary) and Chromium (smoke-only).
test("@smoke @chromium-smoke chat panel renders with a reachable composer", async ({
  page,
}) => {
  await page.goto("/e2e/fixture.html");
  await expect(page.getByTestId("panel")).toBeVisible();
  await expect(page.getByLabel("Ask side-pilot")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});
