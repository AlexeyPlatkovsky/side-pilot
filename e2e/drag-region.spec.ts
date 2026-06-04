import { test, expect } from "@playwright/test";

// Window-chrome drag-region coverage (SP-0gx.2). The panel header must be fully
// draggable: a partially-marked header was a real bug. jsdom can't see this;
// the DOM contract is asserted here in WebKit.
test("the panel header and its content are drag regions", async ({ page }) => {
  await page.goto("/e2e/fixture.html");
  await expect(page.getByTestId("panel")).toBeVisible();

  // The header bar itself is a drag region.
  await expect(page.locator(".panel__header")).toHaveAttribute(
    "data-tauri-drag-region",
    /.*/,
  );

  // Its non-interactive content (title + status) must also be draggable, or
  // those areas become dead zones the window can't be moved from.
  await expect(page.locator(".panel__title")).toHaveAttribute(
    "data-tauri-drag-region",
    /.*/,
  );
  await expect(page.locator(".panel__status")).toHaveAttribute(
    "data-tauri-drag-region",
    /.*/,
  );
});
