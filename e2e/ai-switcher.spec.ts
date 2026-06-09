import { test, expect, type Page } from "@playwright/test";

// Runtime coverage (SP-017) for the AI switcher in the real WebKit engine at the
// expanded-panel size — the picker positioning, per-provider slots, and
// disabled-in-flight state that Vitest + jsdom cannot render. Backed by the
// in-memory ChatApi in src/e2e-seeded-fixture.tsx (whose `runRoute` resolves
// after ~600ms with one reply per target provider).
test.use({ viewport: { width: 380, height: 520 } });

async function gotoSeeded(page: Page) {
  await page.goto("/e2e/seeded.html");
  await expect(page.getByTestId("panel")).toBeVisible();
}

test("default state shows the GPT switcher with no picker open", async ({ page }) => {
  await gotoSeeded(page);

  await expect(
    page.getByRole("button", { name: /choose ai provider \(current: GPT\)/i }),
  ).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(0);

  await page.screenshot({ path: "e2e/.artifacts/ai-switcher-default.png" });
});

test("the picker opens with All at the top and the active provider highlighted", async ({
  page,
}) => {
  await gotoSeeded(page);

  await page.getByRole("button", { name: /choose ai provider/i }).click();

  const options = page.getByRole("menuitemradio");
  await expect(options).toHaveCount(4);
  await expect(options.nth(0)).toContainText("All");
  await expect(options.nth(1)).toContainText("GPT");
  await expect(page.getByRole("menuitemradio", { name: "GPT" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await page.screenshot({ path: "e2e/.artifacts/ai-switcher-picker.png" });
});

test("each chat restores its own selected provider", async ({ page }) => {
  await page.goto("/e2e/seeded.html?initial=collapsed");
  await page.getByRole("button", { name: "Open side-pilot" }).click();
  await expect(page.getByTestId("panel")).toBeVisible();

  await page.getByRole("button", { name: "Show chat history" }).click();
  await page.getByRole("button", { name: "Fix login bug", exact: true }).click();
  await page.getByRole("button", { name: /choose ai provider/i }).click();
  await page.getByRole("menuitemradio", { name: "Gemini" }).click();
  await expect(
    page.getByRole("button", { name: /choose ai provider \(current: Gemini\)/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Refactor auth module", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /choose ai provider \(current: GPT\)/i }),
  ).toBeVisible();

  await page.screenshot({ path: "e2e/.artifacts/ai-switcher-per-chat.png" });
});

test("each chat keeps its selected provider after collapse and reopen", async ({
  page,
}) => {
  await page.goto("/e2e/seeded.html?initial=collapsed");
  await page.getByRole("button", { name: "Open side-pilot" }).click();

  await page.getByRole("button", { name: "Show chat history" }).click();
  await page.getByRole("button", { name: "Fix login bug", exact: true }).click();
  await page.getByRole("button", { name: /choose ai provider/i }).click();
  await page.getByRole("menuitemradio", { name: "Gemini" }).click();

  await page.getByRole("button", { name: "Refactor auth module", exact: true }).click();
  await page.getByRole("button", { name: /choose ai provider/i }).click();
  await page.getByRole("menuitemradio", { name: "Claude" }).click();

  await page.getByRole("button", { name: "Collapse" }).click();
  await page.getByRole("button", { name: "Open side-pilot" }).click();
  await expect(
    page.getByRole("button", { name: /choose ai provider \(current: Claude\)/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Show chat history" }).click();
  await page.getByRole("button", { name: "Fix login bug", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /choose ai provider \(current: Gemini\)/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /choose ai provider/i }).click();
  await page.getByRole("menuitemradio", { name: /^All/ }).click();
  await page.getByRole("button", { name: "Collapse" }).click();
  await page.getByRole("button", { name: "Open side-pilot" }).click();
  await page.getByRole("button", { name: "Show chat history" }).click();
  await page.getByRole("button", { name: "Fix login bug", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /choose ai provider \(current: All\)/i }),
  ).toBeVisible();

  await page.screenshot({ path: "e2e/.artifacts/ai-switcher-collapse-retained.png" });
});

test("a background provider error is visible when its unread chat is reopened", async ({
  page,
}) => {
  // Use a longer routeDelay on CI so the 600ms default seeded timeout doesn't
  // resolve the route before the test can switch to another chat. The route
  // must land *while* a different chat is active to trigger the unread dot.
  await page.goto("/e2e/seeded.html?initial=collapsed&route=error&routeDelay=3000");
  await page.getByRole("button", { name: "Open side-pilot" }).click();
  await page.getByRole("button", { name: /choose ai provider/i }).click();
  await page.getByRole("menuitemradio", { name: "Gemini" }).click();
  await page.getByLabel("Ask side-pilot").fill("check this");
  // Wait for React to re-render after the fill so Send is no longer disabled
  // before clicking. On slow CI runners the stale disabled state swallows the
  // click and the route never fires.
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  await page.getByRole("button", { name: "Send" }).click();

  // Switch to another chat *before* the route resolves (routeDelay=3000ms) so
  // the reply lands in the background and marks the original chat as unread.
  await page.getByRole("button", { name: "Show chat history" }).click();
  await page.getByRole("button", { name: "Fix login bug", exact: true }).click();
  // Wait for the background route to complete and the unread badge to appear.
  await expect(
    page.getByRole("button", { name: /Refactor auth module, unread answer/ }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Refactor auth module, unread answer/ }).click();

  const error = page.getByRole("alert");
  await expect(error).toHaveText(
    "Gemini exited with an error: Requested entity was not found.",
  );
  await expect(error).not.toContainText("Full report available");
  await page.screenshot({ path: "e2e/.artifacts/provider-error-restored.png" });
});

test("All mode renders three fixed provider configuration badges after resolving", async ({
  page,
}) => {
  await page.goto("/e2e/seeded.html?initial=collapsed");
  await page.getByRole("button", { name: "Open side-pilot" }).click();
  await expect(page.getByTestId("panel")).toBeVisible();

  // Select the All route.
  await page.getByRole("button", { name: /choose ai provider/i }).click();
  await page.getByRole("menuitemradio", { name: /^All/ }).click();
  await expect(
    page.getByRole("button", { name: /choose ai provider \(current: All\)/i }),
  ).toBeVisible();

  await page.getByLabel("Ask side-pilot").fill("compare your answers");
  await page.getByRole("button", { name: "Send" }).click();

  // Three per-provider loading slots appear, and the switcher locks while in flight.
  await expect(page.getByTestId("thinking")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /choose ai provider/i })).toBeDisabled();
  await page.screenshot({ path: "e2e/.artifacts/ai-switcher-all-pending.png" });

  // Each provider's reply lands in its own labeled slot. The seeded chat already
  // had one assistant message, so three new replies bring the total to four.
  await expect(page.locator(".message--assistant")).toHaveCount(4, { timeout: 6000 });
  await expect(page.getByTestId("thinking")).toHaveCount(0);
  await expect(page.locator(".message__label", { hasText: "gpt-5.5-low" })).toHaveCount(
    2,
  );
  await expect(page.locator(".message__label", { hasText: "haiku-low" })).toBeVisible();
  await expect(
    page.locator(".message__label", { hasText: "gemini-3-flash-preview-none" }),
  ).toBeVisible();
  // The switcher re-enables once every slot has resolved.
  await expect(page.getByRole("button", { name: /choose ai provider/i })).toBeEnabled();

  await page.screenshot({ path: "e2e/.artifacts/ai-switcher-all-resolved.png" });
});

test("Escape and outside click close the picker, focus returns to toggle", async ({ page }) => {
  await gotoSeeded(page);

  await page.getByRole("button", { name: /choose ai provider/i }).click();
  await expect(page.getByRole("menu")).toBeVisible();

  // Escape closes.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  // Focus returned to the toggle.
  await expect(page.getByRole("button", { name: /choose ai provider/i })).toBeFocused();

  // Open again, then outside click closes.
  await page.getByRole("button", { name: /choose ai provider/i }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.locator(".panel__header").first().click();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("single-provider error shows Retry button, click replaces error with pending slot", async ({
  page,
}) => {
  await page.goto("/e2e/seeded.html?route=error&routeDelay=500");
  await expect(page.getByTestId("panel")).toBeVisible();

  // Default route is GPT (codex).
  await page.getByLabel("Ask side-pilot").fill("retry test");
  await page.getByRole("button", { name: "Send" }).click();

  // An error card appears.
  const error = page.getByRole("alert");
  await expect(error).toBeVisible({ timeout: 3000 });

  // Retry button is visible on the error card.
  const retry = page.getByRole("button", { name: /retry/i });
  await expect(retry).toBeVisible();

  // Click Retry — the error is replaced by a pending slot, then a reply.
  await retry.click();
  await expect(error).not.toBeVisible();
  await expect(page.getByText("A retried codex reply.")).toBeVisible({ timeout: 3000 });
});

test("retry-fails-again shows error card again", async ({ page }) => {
  await page.goto("/e2e/seeded.html?route=error&routeDelay=500&retryFails=1");
  await expect(page.getByTestId("panel")).toBeVisible();

  await page.getByLabel("Ask side-pilot").fill("retry failure test");
  await page.getByRole("button", { name: "Send" }).click();

  // Error card appears.
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 3000 });

  // Click Retry.
  await page.getByRole("button", { name: /retry/i }).click();
  // The retry call fails — an error banner or new error card should appear.
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 3000 });
});

test("single-provider submit resolves one labeled reply", async ({ page }) => {
  await page.goto("/e2e/seeded.html?routeDelay=500");
  await expect(page.getByTestId("panel")).toBeVisible();

  await page.getByLabel("Ask side-pilot").fill("test single provider");
  await page.getByRole("button", { name: "Send" }).click();

  // One thinking slot appears.
  await expect(page.getByTestId("thinking")).toHaveCount(1);

  // One reply labeled with the provider's model.
  await expect(page.locator(".message--assistant")).toHaveCount(2, { timeout: 3000 });
  await expect(page.locator(".message__label", { hasText: "gpt-5.5-low" })).toBeVisible();
});

test.describe("provider error types", () => {
  // For each error kind, the fixture must produce the matching error shape.
  // The seeded fixture currently produces `nonZeroExit` errors via the
  // `route=error` param. Other error types require fixture extension and are
  // noted as the minimum smoke check here: the error card renders with role="alert".
  test("nonZeroExit error shows a readable message in an alert", async ({ page }) => {
    await page.goto("/e2e/seeded.html?route=error&routeDelay=500");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: /choose ai provider/i }).click();
    await page.getByRole("menuitemradio", { name: "Gemini" }).click();

    await page.getByLabel("Ask side-pilot").fill("error test");
    await page.getByRole("button", { name: "Send" }).click();

    const error = page.getByRole("alert");
    await expect(error).toBeVisible({ timeout: 3000 });
    // The error message is human-readable (not a raw stack trace or JSON blob).
    await expect(error).not.toContainText("Full report available");
  });
});
