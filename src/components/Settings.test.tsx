import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "./Settings";

const ALL_SECTIONS = [
  "API Keys",
  "CLI Integrations",
  "Themes",
  "General",
  "Keyboard Shortcuts",
  "Account",
  "About",
];

describe("Settings", () => {
  it("renders the section rail with all seven section labels", () => {
    render(<Settings />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(7);
    for (const label of ALL_SECTIONS) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
  });

  it("selects API Keys (the first section) by default", () => {
    render(<Settings />);

    const apiKeys = screen.getByRole("tab", { name: "API Keys" });
    expect(apiKeys).toHaveAttribute("aria-selected", "true");

    const panel = screen.getByRole("tabpanel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAccessibleName("API Keys");
  });

  it("shows only the active section's tabpanel", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    // By default only the API Keys panel is visible.
    const panels = screen.getAllByRole("tabpanel");
    expect(panels).toHaveLength(1);

    // Click "General" — now only the General panel is visible.
    await user.click(screen.getByRole("tab", { name: "General" }));
    const afterClick = screen.getAllByRole("tabpanel");
    expect(afterClick).toHaveLength(1);
  });

  it("selects a section and shows its pane on click", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    const generalTab = screen.getByRole("tab", { name: "General" });
    await user.click(generalTab);

    expect(generalTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "API Keys" })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAccessibleName("General");
  });

  it("moves selection to the next tab on Arrow Down", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    const apiTab = screen.getByRole("tab", { name: "API Keys" });
    apiTab.focus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "CLI Integrations" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "Themes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("wraps from the last tab to the first on Arrow Down", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(screen.getByRole("tab", { name: "About" }));
    screen.getByRole("tab", { name: "About" }).focus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "API Keys" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("moves selection to the previous tab on Arrow Up", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(screen.getByRole("tab", { name: "Themes" }));
    screen.getByRole("tab", { name: "Themes" }).focus();

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("tab", { name: "CLI Integrations" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("tab", { name: "API Keys" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("wraps from the first tab to the last on Arrow Up", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    screen.getByRole("tab", { name: "API Keys" }).focus();

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("tab", { name: "About" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("moves to the first tab on Home", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    await user.click(screen.getByRole("tab", { name: "Account" }));
    screen.getByRole("tab", { name: "Account" }).focus();

    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "API Keys" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("moves to the last tab on End", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    screen.getByRole("tab", { name: "API Keys" }).focus();

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "About" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("sets correct ARIA attributes on rail and panes", () => {
    render(<Settings />);

    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveAttribute("aria-label", "Settings sections");

    const tabs = screen.getAllByRole("tab");
    for (const tab of tabs) {
      const controls = tab.getAttribute("aria-controls");
      expect(controls).toBeTruthy();

      // The corresponding panel should be labelled by this tab.
      const panel = document.getElementById(controls!);
      expect(panel).not.toBeNull();
      expect(panel!.getAttribute("aria-labelledby")).toBe(tab.id);
    }

    // Only one tab is selectable via Tab at a time (roving tabindex).
    const focusable = tabs.filter((t) => t.getAttribute("tabindex") === "0");
    expect(focusable).toHaveLength(1);
    const nonFocusable = tabs.filter((t) => t.getAttribute("tabindex") === "-1");
    expect(nonFocusable).toHaveLength(6);
  });

  it("renders an empty placeholder pane for the active section", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    // Click on General to check its pane.
    await user.click(screen.getByRole("tab", { name: "General" }));

    const panel = screen.getByRole("tabpanel");
    expect(panel).toBeInTheDocument();
    // Pane is an empty placeholder — it should exist but not contain detailed content.
    expect(panel).toBeVisible();
  });

  it("manages roving tabindex when selection changes via click", async () => {
    const user = userEvent.setup();
    render(<Settings />);

    // Clicking moves focus and tabindex to the new tab.
    await user.click(screen.getByRole("tab", { name: "Themes" }));

    const themes = screen.getByRole("tab", { name: "Themes" });
    expect(themes).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "API Keys" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });
});
