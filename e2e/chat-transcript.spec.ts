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
  await page.locator(".chat-row__select", { hasText: "Refactor auth module" }).click();
  await expect(page.locator(".chat-row__unread")).toHaveCount(0);
});

test("All-provider thinking labels survive chat switches and collapse", async ({
  page,
}) => {
  await page.goto("/e2e/seeded.html?initial=collapsed&routeDelay=3000");
  await page.getByRole("button", { name: "Open side-pilot" }).click();
  await page.getByRole("button", { name: /choose ai provider/i }).click();
  await page.getByRole("menuitemradio", { name: /^All/ }).click();
  await page.getByLabel("Ask side-pilot").fill("How do I add passkey login?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("thinking")).toHaveCount(3);

  await page.getByRole("button", { name: "Show chat history" }).click();
  await page.locator(".chat-row__select", { hasText: "Fix login bug" }).click();
  await page.locator(".chat-row__select", { hasText: "Refactor auth module" }).click();
  await expect(page.getByTestId("thinking")).toHaveCount(3);
  await expect(page.getByText("How do I add passkey login?")).toHaveCount(2);

  await page.getByRole("button", { name: "Collapse" }).click();
  await page.getByRole("button", { name: "Open side-pilot" }).click();
  await expect(page.getByTestId("thinking")).toHaveCount(3);

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Back to panel" }).click();
  await expect(page.getByTestId("thinking")).toHaveCount(3);
  await expect(page.getByText("How do I add passkey login?")).toHaveCount(2);
  await expect(page.getByTestId("thinking").nth(0)).toHaveAttribute(
    "data-provider",
    "codex",
  );
  await expect(page.getByTestId("thinking").nth(1)).toHaveAttribute(
    "data-provider",
    "claude",
  );
  await expect(page.getByTestId("thinking").nth(2)).toHaveAttribute(
    "data-provider",
    "gemini",
  );

  await page.screenshot({ path: "e2e/.artifacts/all-thinking-restored.png" });
});

test("the latest rapid chat selection wins when an earlier history read is slow", async ({
  page,
}) => {
  await page.goto("/e2e/seeded.html?slowHistory=s2&historyDelay=1000");
  await expect(page.getByTestId("panel")).toBeVisible();
  await page.getByRole("button", { name: "Show chat history" }).click();

  await page.locator(".chat-row__select", { hasText: "Fix login bug" }).click();
  await page.locator(".chat-row__select", { hasText: "Refactor auth module" }).click();

  await page.waitForTimeout(1200);
  await expect(page.locator(".chat__active-title")).toHaveText("Refactor auth module");
  await expect(page.getByText("How do I add passkey login?")).toBeVisible();
  await page.screenshot({ path: "e2e/.artifacts/latest-chat-selection-wins.png" });
});

test("deleting a chat invalidates its slow pending selection", async ({ page }) => {
  await page.goto("/e2e/seeded.html?slowHistory=s2&historyDelay=1000");
  await expect(page.getByTestId("panel")).toBeVisible();
  await page.getByRole("button", { name: "Show chat history" }).click();

  await page.locator(".chat-row__select", { hasText: "Fix login bug" }).click();
  await page.getByRole("button", { name: "Options for Fix login bug" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: "Delete chat" })
    .getByRole("button", { name: "Delete" })
    .click();

  await page.waitForTimeout(1200);
  await expect(page.locator(".chat__active-title")).toHaveText("Refactor auth module");
  await expect(
    page.locator(".chat-row__select", { hasText: "Fix login bug" }),
  ).toHaveCount(0);
  await expect(page.getByText("How do I add passkey login?")).toBeVisible();
});

test("error banner appears when listSessions rejects", async ({ page }) => {
  await page.goto("/e2e/seeded.html?errorBanner=1");
  await expect(page.getByTestId("panel")).toBeVisible();

  // The error banner with role="alert" is visible.
  const banner = page.locator(".conversation__error[role='alert']");
  await expect(banner).toBeVisible();
  await expect(banner).not.toBeEmpty();
  await page.screenshot({ path: "e2e/.artifacts/error-banner.png" });
});

test("empty sessions list auto-creates one session", async ({ page }) => {
  await page.goto("/e2e/seeded.html?emptySessions=1");
  await expect(page.getByTestId("panel")).toBeVisible();

  // The rail shows the auto-created session.
  await page.getByRole("button", { name: "Show chat history" }).click();
  await expect(page.getByRole("complementary", { name: "Chat history" })).toBeVisible();
  await expect(page.getByText("Untitled")).toBeVisible();
  // The transcript is empty.
  await expect(page.getByText("How do I add passkey login?")).toHaveCount(0);
});

test("conversation div has aria-live=\"polite\"", async ({ page }) => {
  await page.goto("/e2e/seeded.html");
  await expect(page.getByTestId("panel")).toBeVisible();

  const conversation = page.locator(".conversation");
  await expect(conversation).toBeVisible();
  await expect(conversation).toHaveAttribute("aria-live", "polite");
});
