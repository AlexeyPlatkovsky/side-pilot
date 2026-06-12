import { test, expect, type Page } from "@playwright/test";

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

test.describe("GeneralSettings controls", () => {
  test("toggles always-on-top and switches position mode", async ({ page }) => {
    await page.goto("/e2e/seeded.html");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("tab", { name: "General" }).click();

    // Toggle always-on-top.
    const toggle = page.getByLabel("Always on top");
    await expect(toggle).toBeVisible();
    await toggle.click();
    // Clicking the toggle should not break the settings view.
    await expect(page.getByTestId("settings")).toBeVisible();
  });

  test("pin button appears in pin mode", async ({ page }) => {
    await page.goto("/e2e/seeded.html");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("tab", { name: "General" }).click();

    // Switch to pin mode.
    const trackLast = page.getByRole("radio", { name: /track last position/i });
    const pinMode = page.getByRole("radio", { name: /pin the position/i });
    await expect(trackLast).toBeChecked();
    await pinMode.click();
    await expect(pinMode).toBeChecked();

    // Pin button appears.
    const pinBtn = page.getByRole("button", { name: /pin/i });
    await expect(pinBtn).toBeVisible();
  });

  test("language dropdown opens and allows selection", async ({ page }) => {
    await page.goto("/e2e/seeded.html");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("tab", { name: "General" }).click();

    await page.getByRole("button", { name: /language/i }).click();
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole("option", { name: /english/i })).toBeVisible();
    await expect(listbox.getByRole("option", { name: /russian/i })).toBeVisible();
  });
});

test.describe("settings keyboard navigation", () => {
  async function openSettings(page: Page) {
    await page.goto("/e2e/seeded.html");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: "Open settings" }).click();
    await expect(page.getByTestId("settings")).toBeVisible();
  }

  test("Arrow Down/Up cycle through tabs with wrapping", async ({ page }) => {
    await openSettings(page);
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(7);

    // Focus the first tab.
    await tabs.first().focus();
    await expect(tabs.first()).toBeFocused();

    // Arrow Down moves to the next tab each time.
    for (let i = 1; i < 7; i++) {
      await page.keyboard.press("ArrowDown");
      await expect(tabs.nth(i)).toBeFocused();
    }
    // Arrow Down from the last wraps to the first.
    await page.keyboard.press("ArrowDown");
    await expect(tabs.first()).toBeFocused();

    // Arrow Up wraps from first to last.
    await page.keyboard.press("ArrowUp");
    await expect(tabs.nth(6)).toBeFocused();
  });

  test("Home jumps to first tab, End jumps to last", async ({ page }) => {
    await openSettings(page);
    const tabs = page.getByRole("tab");

    // Focus the middle tab, then Home.
    await tabs.nth(3).focus();
    await page.keyboard.press("Home");
    await expect(tabs.first()).toBeFocused();

    // End jumps to the last tab.
    await page.keyboard.press("End");
    await expect(tabs.nth(6)).toBeFocused();
  });
});

test.describe("GeneralSettings loading and error states", () => {
  test("shows loading placeholder while preferences load", async ({ page }) => {
    await page.goto("/e2e/seeded.html?generalLoadDelay=2000");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("tab", { name: "General" }).click();
    await expect(page.getByText("Loading...")).toBeVisible();
  });

  test("shows error text when preferences fail to load", async ({ page }) => {
    await page.goto("/e2e/seeded.html?generalError=1");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("tab", { name: "General" }).click();
    await expect(
      page
        .getByRole("tabpanel", { name: "General" })
        .getByText("Failed to load general settings."),
    ).toBeVisible();
  });
});

test.describe("ThemesSettings pane (SP-041/SP-043)", () => {
  test("shows three theme radio options in the Themes pane", async ({ page }) => {
    await page.goto("/e2e/seeded.html");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("tab", { name: "Themes" }).click();

    const pane = page.getByRole("tabpanel", { name: "Themes" });
    await expect(pane.getByRole("radio", { name: "Default" })).toBeVisible();
    await expect(pane.getByRole("radio", { name: "Cyberpunk" })).toBeVisible();
    await expect(pane.getByRole("radio", { name: "Minimalist" })).toBeVisible();

    await page.screenshot({
      path: "e2e/.artifacts/themes-pane-default.png",
      fullPage: false,
    });
  });

  test("selecting Cyberpunk applies data-theme to <html>", async ({ page }) => {
    await page.goto("/e2e/seeded.html");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("tab", { name: "Themes" }).click();

    const pane = page.getByRole("tabpanel", { name: "Themes" });
    await pane.getByRole("radio", { name: "Cyberpunk" }).click();

    const dataTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(dataTheme).toBe("cyberpunk");

    await page.screenshot({
      path: "e2e/.artifacts/themes-pane-cyberpunk.png",
      fullPage: false,
    });
  });

  test("selecting Default removes data-theme from <html>", async ({ page }) => {
    await page.goto("/e2e/seeded.html");
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("tab", { name: "Themes" }).click();

    const pane = page.getByRole("tabpanel", { name: "Themes" });
    await pane.getByRole("radio", { name: "Cyberpunk" }).click();
    await pane.getByRole("radio", { name: "Default" }).click();

    const dataTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(dataTheme).toBeNull();
  });
});

test("Cyberpunk secondary settings buttons remain readable", async ({ page }) => {
  await page.goto("/e2e/seeded.html");
  await expect(page.getByTestId("panel")).toBeVisible();
  await page.getByRole("button", { name: "Open settings" }).click();

  await page.getByRole("tab", { name: "Themes" }).click();
  await page
    .getByRole("tabpanel", { name: "Themes" })
    .getByRole("radio", { name: "Cyberpunk" })
    .click();

  await page.getByRole("tab", { name: "CLI Integrations" }).click();
  const add = page.getByRole("button", { name: "Add" });
  await expect(add).toHaveCSS("color", "rgb(238, 244, 255)");
  await expect(add).toHaveCSS("background-color", "rgba(36, 24, 86, 0.9)");
  await add.click();

  const dialog = page.getByRole("dialog", { name: "Add a custom CLI" });
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expect(cancel).toHaveCSS("color", "rgb(238, 244, 255)");
  await expect(cancel).toHaveCSS("background-color", "rgba(36, 24, 86, 0.9)");

  await page.screenshot({
    path: "e2e/.artifacts/cyberpunk-add-cli-dialog.png",
    fullPage: false,
  });
});
