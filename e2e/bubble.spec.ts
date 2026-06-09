import { test, expect } from "@playwright/test";

test.describe("collapsed bubble", () => {
  test("renders as a dot with correct aria-label and drag region", async ({ page }) => {
    await page.goto("/e2e/seeded.html?initial=collapsed");
    const dot = page.getByRole("button", { name: "Open side-pilot" });
    await expect(dot).toBeVisible();
    await expect(dot).toHaveAttribute("data-tauri-drag-region", /.*/);
    await page.screenshot({ path: "e2e/.artifacts/bubble-collapsed.png" });
  });

  test("clicking the dot expands the panel", async ({ page }) => {
    await page.goto("/e2e/seeded.html?initial=collapsed");
    await page.getByRole("button", { name: "Open side-pilot" }).click();
    await expect(page.getByTestId("panel")).toBeVisible();
  });

  test("Escape from expanded collapses to dot", async ({ page }) => {
    await page.goto("/e2e/seeded.html?initial=collapsed");
    await page.getByRole("button", { name: "Open side-pilot" }).click();
    await expect(page.getByTestId("panel")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("panel")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Open side-pilot" })).toBeVisible();
  });
});
