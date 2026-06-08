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

    const results = await new AxeBuilder({ page })
      .include("form")
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
