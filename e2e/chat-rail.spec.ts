import { test, expect, type Page } from "@playwright/test";

// Chat history rail runtime coverage (SP-048/050), measured in the WebKit
// engine — toggle visibility, the rail's layout reflow, and the per-row options
// menu are layout/interaction behaviours that Vitest + jsdom cannot exercise.

// Render at the real expanded-panel size (EXPANDED_SIZE in
// src/state/bubbleState.ts) so the rail squeeze, title ellipsis, and dialog
// fit are verified at the dimensions the Tauri window actually uses — not the
// Desktop Safari default viewport.
test.use({ viewport: { width: 380, height: 520 } });

async function gotoPanel(page: Page) {
  await page.goto("/e2e/fixture.html");
  await expect(page.getByTestId("panel")).toBeVisible();
}

async function mainWidth(page: Page) {
  return page.$eval(".chat__main", (el) => Math.round(el.getBoundingClientRect().width));
}

test("the rail toggles open and reclaims transcript width when hidden", async ({
  page,
}) => {
  await gotoPanel(page);

  // Rail hidden by default; the main column owns the full width.
  await expect(page.getByRole("complementary", { name: "Chat history" })).toHaveCount(0);
  const widthClosed = await mainWidth(page);

  await page.getByRole("button", { name: "Show chat history" }).click();
  const rail = page.getByRole("complementary", { name: "Chat history" });
  await expect(rail).toBeVisible();
  // The rail takes real horizontal space, so the main column narrows.
  const widthOpen = await mainWidth(page);
  expect(widthOpen).toBeLessThan(widthClosed);

  // A compact, single-line row renders inside the rail.
  const row = page.locator(".chat-row__select").first();
  await expect(row).toBeVisible();
  expect(Math.round((await row.boundingBox())!.height)).toBeLessThanOrEqual(40);

  await page.screenshot({ path: "e2e/.artifacts/chat-rail-open.png" });

  // The options menu opens in WebKit and exposes Rename + Delete.
  await page.locator(".chat-row__menu").first().click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await page.screenshot({ path: "e2e/.artifacts/chat-rail-menu.png" });

  // The rename dialog opens at panel size and fits within the 380px window.
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const dialog = page.getByRole("dialog", { name: /Rename chat/ });
  await expect(dialog).toBeVisible();
  const dialogBox = (await dialog.locator(".dialog").boundingBox())!;
  expect(dialogBox.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(380);
  await page.screenshot({ path: "e2e/.artifacts/chat-rail-dialog.png" });

  // Invalid title (special symbol): the inline hint renders in WebKit, the
  // field is marked invalid, and Save is blocked. (jsdom can assert presence
  // but not the real layout/wrap of the hint at panel width.)
  const titleInput = dialog.getByRole("textbox", { name: /Chat title/ });
  await titleInput.fill("bad@name");
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(titleInput).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
  await page.screenshot({ path: "e2e/.artifacts/chat-rail-dialog-invalid.png" });

  // Escape closes it (focus is inside the modal).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Hiding the rail returns the reclaimed width to the transcript.
  await page.getByRole("button", { name: "Hide chat history" }).click();
  await expect(page.getByRole("complementary", { name: "Chat history" })).toHaveCount(0);
  expect(await mainWidth(page)).toBe(widthClosed);
});

test("the toolbar pencil opens the rename dialog for the active chat", async ({
  page,
}) => {
  await gotoPanel(page);

  // The Edit/pencil control lives next to the active chat title in the toolbar.
  await page.getByRole("button", { name: "Rename chat" }).click();
  const dialog = page.getByRole("dialog", { name: /Rename chat/ });
  await expect(dialog).toBeVisible();
  // Fits within the 380px window like the rail-triggered rename.
  const box = (await dialog.locator(".dialog").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(380);
  await page.screenshot({ path: "e2e/.artifacts/chat-toolbar-rename.png" });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the clear chat dialog cancels and confirms", async ({ page }) => {
  await page.goto("/e2e/seeded.html");
  await expect(page.getByTestId("panel")).toBeVisible();

  await page.getByRole("button", { name: "Clear" }).click();
  const dialog = page.getByRole("dialog", { name: /Clear chat/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/permanently deleted/i);

  // Cancel leaves the transcript unchanged.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("How do I add passkey login?")).toBeVisible();

  // Confirm clears the transcript.
  await page.getByRole("button", { name: "Clear" }).click();
  await page
    .getByRole("dialog", { name: /Clear chat/i })
    .getByRole("button", { name: "Clear" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("How do I add passkey login?")).toHaveCount(0);
});

test("new chat button creates a session and switches to it", async ({ page }) => {
  await page.goto("/e2e/seeded.html");
  await expect(page.getByTestId("panel")).toBeVisible();
  await page.getByRole("button", { name: "Show chat history" }).click();
  await expect(page.getByRole("complementary", { name: "Chat history" })).toBeVisible();

  await page.getByRole("button", { name: "New" }).click();
  // A new session is created and becomes active — the transcript is empty.
  await expect(page.getByText("How do I add passkey login?")).toHaveCount(0);
  // The rail shows the new untitled chat.
  await expect(page.getByText("Untitled")).toBeVisible();
});

test("delete dialog cancels and confirms", async ({ page }) => {
  await page.goto("/e2e/seeded.html");
  await expect(page.getByTestId("panel")).toBeVisible();
  await page.getByRole("button", { name: "Show chat history" }).click();

  // Cancel: row stays.
  await page.getByRole("button", { name: "Options for Refactor auth module" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: "Delete chat" })
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".chat-row__select", { hasText: "Refactor auth module" }),
  ).toBeVisible();

  // Confirm: row removed, switches to next chat.
  await page.getByRole("button", { name: "Options for Refactor auth module" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: "Delete chat" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".chat-row__select", { hasText: "Refactor auth module" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".chat-row__select", { hasText: "Fix login bug" }),
  ).toBeVisible();
});

test("rename dialog validates empty and max-length input", async ({ page }) => {
  await page.goto("/e2e/seeded.html");
  await expect(page.getByTestId("panel")).toBeVisible();
  await page.getByRole("button", { name: "Rename chat" }).click();
  const dialog = page.getByRole("dialog", { name: /Rename chat/ });
  await expect(dialog).toBeVisible();

  // Empty input disables Save.
  const titleInput = dialog.getByRole("textbox", { name: /Chat title/ });
  await titleInput.fill("");
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();

  // Long input at boundary.
  const maxLen = 40;
  const within = "a".repeat(maxLen);
  await titleInput.fill(within);
  // At 40 characters the input should still be valid (not aria-invalid from
  // length alone, assuming the backend accepts it).
  await expect(titleInput).not.toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled();

  // Valid rename updates the toolbar title.
  await titleInput.fill("Updated title");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Updated title")).toBeVisible();
});

test("right-click context menu opens with Rename and Delete", async ({ page }) => {
  await page.goto("/e2e/seeded.html");
  await expect(page.getByTestId("panel")).toBeVisible();
  await page.getByRole("button", { name: "Show chat history" }).click();
  await expect(page.getByRole("complementary", { name: "Chat history" })).toBeVisible();

  // Right-click a chat row.
  const row = page.locator(".chat-row__select", { hasText: "Refactor auth module" });
  await row.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

test.describe("dialog focus trap", () => {
  async function openRenameDialog(page: Page) {
    await page.goto("/e2e/seeded.html");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: "Rename chat" }).click();
    return page.getByRole("dialog", { name: /Rename chat/ });
  }

  test("dialog has focusable elements and aria-modal for focus trapping", async ({
    page,
  }) => {
    await openRenameDialog(page);
    const dialog = page.getByRole("dialog", { name: /Rename chat/ });

    // aria-modal tells assistive tech that content outside is inert.
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    // At least 2 focusable elements exist inside the dialog.
    const focusableCount = await page.evaluate(() => {
      const root = document.querySelector('[role="dialog"]');
      if (!root) return 0;
      return root.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ).length;
    });
    expect(focusableCount).toBeGreaterThanOrEqual(2);
  });
});
