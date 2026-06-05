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
  return page.$eval(".chat__main", (el) =>
    Math.round(el.getBoundingClientRect().width),
  );
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
