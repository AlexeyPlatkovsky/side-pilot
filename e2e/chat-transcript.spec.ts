import { test, expect, type Page } from "@playwright/test";

// Seeded runtime coverage for the message timestamps (SP-055) and the rail's
// in-progress/unread indicators (SP-056), measured in WebKit at the real
// expanded-panel size — layout/animation surfaces that Vitest + jsdom can't
// render. Backed by the in-memory ChatApi in src/e2e-seeded-fixture.tsx.
test.use({ viewport: { width: 380, height: 520 } });

async function gotoSeeded(page: Page) {
  await page.goto("/e2e/seeded.html");
  await expect(page.getByTestId("panel")).toBeVisible();
}

test("each message shows a one-row 24h timestamp label", async ({ page }) => {
  await gotoSeeded(page);

  // The seeded active chat (s1) has a user + assistant message.
  const time = page.locator(".message__time").first();
  await expect(time).toBeVisible();
  // Same-day seed → bare 24h HH:MM, no date prefix.
  expect((await time.textContent())?.trim()).toMatch(/^\d{2}:\d{2}$/);

  // The assistant meta (model badge + timestamp) stays on a single line.
  const meta = page.locator(".message--assistant .message__meta").first();
  const box = (await meta.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(22);

  await page.screenshot({ path: "e2e/.artifacts/chat-timestamps.png" });
});

test("an assistant link does not navigate the app's WebView", async ({ page }) => {
  await gotoSeeded(page);

  const url = page.url();
  const link = page.getByRole("link", { name: "WebAuthn guide" });
  await expect(link).toBeVisible();
  await link.click();

  // The panel must still be the app itself — the WebView never navigated away.
  await expect(page.getByTestId("panel")).toBeVisible();
  expect(page.url()).toBe(url);
});

test("the rail shows a spinner while replying, then an unread dot in the background", async ({
  page,
}) => {
  await gotoSeeded(page);

  await page.getByLabel("Ask side-pilot").fill("kick off a reply");
  await page.getByRole("button", { name: "Send" }).click();

  await page.getByRole("button", { name: "Show chat history" }).click();
  // The active chat's row shows the in-progress spinner while the reply runs.
  await expect(page.locator(".chat-row__spinner").first()).toBeVisible();
  await page.screenshot({ path: "e2e/.artifacts/chat-rail-spinner.png" });

  // Switch to the other chat; the reply then lands in the background → unread.
  // Target the row's select control specifically (the options button shares the
  // title text), so the locator is unambiguous.
  await page.locator(".chat-row__select", { hasText: "Fix login bug" }).click();
  await expect(page.locator(".chat-row__unread").first()).toBeVisible({
    timeout: 3000,
  });
  await page.screenshot({ path: "e2e/.artifacts/chat-rail-unread.png" });

  // Collapsing the rail must still signal the unread answer via a toggle badge,
  // otherwise the only indicator would be hidden.
  await page.getByRole("button", { name: "Hide chat history" }).click();
  await expect(page.locator(".chat__rail-toggle-badge")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Show chat history, unread/ }),
  ).toBeVisible();
  await page.screenshot({ path: "e2e/.artifacts/chat-rail-toggle-unread.png" });
  // Reopen the rail to continue.
  await page.getByRole("button", { name: /Show chat history/ }).click();

  // Reopening the chat clears the unread dot.
  await page
    .locator(".chat-row__select", { hasText: "Refactor auth module" })
    .click();
  await expect(page.locator(".chat-row__unread")).toHaveCount(0);
});
