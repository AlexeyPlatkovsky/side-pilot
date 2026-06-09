import { test, expect } from "@playwright/test";

test("@chromium-smoke panel renders at 320x480 (minimum width)", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto("/e2e/seeded.html");
  await expect(page.getByTestId("panel")).toBeVisible();
  // The panel roughly fits within the viewport (border/positioning may add 1-2px).
  const panel = page.getByTestId("panel");
  const box = (await panel.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(325);
  expect(box.height).toBeLessThanOrEqual(485);
  // Key controls are reachable.
  await expect(page.getByLabel("Ask side-pilot")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await page.screenshot({ path: "e2e/.artifacts/viewport-320x480.png" });
});

test("@chromium-smoke panel renders at 480x800 (tall)", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 });
  await page.goto("/e2e/seeded.html");
  await expect(page.getByTestId("panel")).toBeVisible();
  const panel = page.getByTestId("panel");
  const box = (await panel.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(485);
  expect(box.height).toBeLessThanOrEqual(805);
  await expect(page.getByLabel("Ask side-pilot")).toBeVisible();
  await page.screenshot({ path: "e2e/.artifacts/viewport-480x800.png" });
});
