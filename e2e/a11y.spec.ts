import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("a11y", () => {
  test("chat panel has no critical a11y violations", async ({ page }) => {
    await page.goto("/e2e/fixture.html");
    await expect(page.getByTestId("panel")).toBeVisible();
    await expect(page.getByLabel("Ask side-pilot")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-testid="panel"]')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("composer and send interaction area has no a11y violations", async ({ page }) => {
    await page.goto("/e2e/fixture.html");
    await expect(page.getByLabel("Ask side-pilot")).toBeVisible();

    const results = await new AxeBuilder({ page }).include("form").analyze();

    expect(results.violations).toEqual([]);
  });

  test("active chat row has aria-current", async ({ page }) => {
    await page.goto("/e2e/seeded.html");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: "Show chat history" }).click();
    await expect(page.getByRole("complementary", { name: "Chat history" })).toBeVisible();

    // The default active chat has `aria-current` on its select button.
    const activeRow = page.locator(".chat-row__select", {
      hasText: "Refactor auth module",
    });
    await expect(activeRow).toHaveAttribute("aria-current", "true");

    // Switch to the other chat.
    await page.locator(".chat-row__select", { hasText: "Fix login bug" }).click();
    await expect(
      page.locator(".chat-row__select", { hasText: "Fix login bug" }),
    ).toHaveAttribute("aria-current", "true");
  });

  test("dialog has aria-labelledby pointing to a visible heading", async ({ page }) => {
    await page.goto("/e2e/seeded.html");
    await expect(page.getByTestId("panel")).toBeVisible();

    // Open the rename dialog.
    await page.getByRole("button", { name: "Rename chat" }).click();
    const dialog = page.getByRole("dialog", { name: /Rename chat/ });
    await expect(dialog).toBeVisible();

    // The aria-labelledby attribute references an existing heading.
    const labelledby = await dialog.getAttribute("aria-labelledby");
    expect(labelledby).toBeTruthy();
    const heading = page.locator(`[id="${labelledby}"]`);
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/rename chat/i);
  });

  test("settings tablist has correct ARIA attributes", async ({ page }) => {
    await page.goto("/e2e/seeded.html");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: "Open settings" }).click();
    await expect(page.getByTestId("settings")).toBeVisible();

    const tablist = page.getByRole("tablist");
    await expect(tablist).toHaveAttribute("aria-orientation", "vertical");
    await expect(tablist).toHaveAttribute("aria-label");

    // Each tabpanel is labelled by its triggering tab.
    const panels = page.getByRole("tabpanel");
    await expect(panels.first()).toHaveAttribute("aria-labelledby");
  });
});
