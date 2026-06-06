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

test("All mode renders three labeled provider slots that load then resolve", async ({
  page,
}) => {
  await gotoSeeded(page);

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
  await expect(page.locator(".message__label", { hasText: "Claude" })).toBeVisible();
  await expect(page.locator(".message__label", { hasText: "Gemini" })).toBeVisible();
  // The switcher re-enables once every slot has resolved.
  await expect(
    page.getByRole("button", { name: /choose ai provider/i }),
  ).toBeEnabled();

  await page.screenshot({ path: "e2e/.artifacts/ai-switcher-all-resolved.png" });
});
