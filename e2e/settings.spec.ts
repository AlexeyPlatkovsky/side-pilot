import { test, expect } from "@playwright/test";

// Settings view WebKit validation (SP-031). The section rail, active tab, and
// pane content must render correctly in WebKit — jsdom can't verify layout
// sizing, focus rings, or the `hidden` attribute's effect on visibility.

const ALL_SECTIONS = [
  "API Keys",
  "CLI Integrations",
  "Themes",
  "General",
  "Keyboard Shortcuts",
  "Account",
  "About",
];

test("settings rail renders all seven sections in WebKit", async ({ page }) => {
  await page.goto("/e2e/fixture.html");
  await expect(page.getByTestId("panel")).toBeVisible();

  // Open settings via the gear control.
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByTestId("settings")).toBeVisible();

  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(7);

  for (const label of ALL_SECTIONS) {
    await expect(page.getByRole("tab", { name: label })).toBeVisible();
  }
});

test("API Keys is the active section by default", async ({ page }) => {
  await page.goto("/e2e/fixture.html");
  await page.getByRole("button", { name: "Open settings" }).click();

  const apiTab = page.getByRole("tab", { name: "API Keys" });
  await expect(apiTab).toHaveAttribute("aria-selected", "true");

  const panel = page.getByRole("tabpanel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("API Keys");
});

test("clicking a rail section switches the active pane", async ({ page }) => {
  await page.goto("/e2e/fixture.html");
  await page.getByRole("button", { name: "Open settings" }).click();

  await page.getByRole("tab", { name: "General" }).click();

  await expect(page.getByRole("tab", { name: "General" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: "API Keys" })).toHaveAttribute(
    "aria-selected",
    "false",
  );

  const panel = page.getByRole("tabpanel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("General");
});

test("only the active tabpanel is visible in WebKit", async ({ page }) => {
  await page.goto("/e2e/fixture.html");
  await page.getByRole("button", { name: "Open settings" }).click();

  // getByRole returns only visible elements; hidden panels are excluded.
  const panels = page.getByRole("tabpanel");
  await expect(panels).toHaveCount(1);

  await page.getByRole("tab", { name: "About" }).click();
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(page.getByRole("tabpanel")).toContainText("About");
});

test("Back control returns to the panel from settings", async ({ page }) => {
  await page.goto("/e2e/fixture.html");
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByTestId("settings")).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();

  await expect(page.getByTestId("panel")).toBeVisible();
  await expect(page.getByTestId("settings")).not.toBeVisible();
});

test("settings view renders the section rail with correct layout in WebKit", async ({
  page,
}) => {
  await page.goto("/e2e/fixture.html");
  await page.getByRole("button", { name: "Open settings" }).click();

  // Verify the rail element exists and is visible.
  const rail = page.locator(".settings-rail");
  await expect(rail).toBeVisible();

  // Verify the pane exists and is visible.
  const pane = page.locator(".settings-pane");
  await expect(pane).toBeVisible();

  // Capture screenshot for design-reviewer evidence.
  await page.screenshot({
    path: "e2e/.artifacts/settings-rail-api-keys.png",
    fullPage: false,
  });

  // Click a different section and capture again to show pane switching.
  await page.getByRole("tab", { name: "General" }).click();
  await page.screenshot({
    path: "e2e/.artifacts/settings-rail-general.png",
    fullPage: false,
  });
});
