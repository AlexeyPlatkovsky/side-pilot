import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "./Settings";
import type { ChatApi } from "../chat/api";

const ALL_SECTIONS = [
  "API Keys",
  "CLI Integrations",
  "Themes",
  "General",
  "Keyboard Shortcuts",
  "Account",
  "About",
];

function mockChatApi(overrides: Partial<ChatApi> = {}): ChatApi {
  return {
    getGeneralPreferences: vi.fn().mockResolvedValue({
      alwaysOnTop: true,
      positionMode: "trackLast",
      pinnedPosition: null,
      lastKnownPosition: null,
      language: "en",
    }),
    updateGeneralPreferences: vi.fn().mockImplementation((v) => Promise.resolve(v)),
    getProviderPreferences: vi.fn(),
    updateProviderPreferences: vi.fn(),
    runAdapter: vi.fn(),
    runRoute: vi.fn(),
    retryRoute: vi.fn(),
    createSession: vi.fn(),
    appendMessage: vi.fn(),
    readHistory: vi.fn(),
    listSessions: vi.fn(),
    renameSession: vi.fn(),
    deleteSession: vi.fn(),
    clearSession: vi.fn(),
    updateCodexSessionId: vi.fn(),
    openExternal: vi.fn(),
    ...overrides,
  };
}

describe("Settings", () => {
  const api = mockChatApi();

  it("renders the section rail with all seven section labels", () => {
    render(<Settings chatApi={api} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(7);
    for (const label of ALL_SECTIONS) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
  });

  it("selects API Keys (the first section) by default", () => {
    render(<Settings chatApi={api} />);

    const apiKeys = screen.getByRole("tab", { name: "API Keys" });
    expect(apiKeys).toHaveAttribute("aria-selected", "true");

    const panel = screen.getByRole("tabpanel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAccessibleName("API Keys");
  });

  it("shows only the active section's tabpanel", async () => {
    const user = userEvent.setup();
    render(<Settings chatApi={api} />);

    const panels = screen.getAllByRole("tabpanel");
    expect(panels).toHaveLength(1);

    await user.click(screen.getByRole("tab", { name: "General" }));
    const afterClick = screen.getAllByRole("tabpanel");
    expect(afterClick).toHaveLength(1);
  });

  it("selects a section and shows its pane on click", async () => {
    const user = userEvent.setup();
    render(<Settings chatApi={api} />);

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
    render(<Settings chatApi={api} />);

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
    render(<Settings chatApi={api} />);

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
    render(<Settings chatApi={api} />);

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
    render(<Settings chatApi={api} />);

    screen.getByRole("tab", { name: "API Keys" }).focus();

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("tab", { name: "About" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("moves to the first tab on Home", async () => {
    const user = userEvent.setup();
    render(<Settings chatApi={api} />);

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
    render(<Settings chatApi={api} />);

    screen.getByRole("tab", { name: "API Keys" }).focus();

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "About" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("sets correct ARIA attributes on rail and panes", () => {
    render(<Settings chatApi={api} />);

    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveAttribute("aria-label", "Settings sections");

    const tabs = screen.getAllByRole("tab");
    for (const tab of tabs) {
      const controls = tab.getAttribute("aria-controls");
      expect(controls).toBeTruthy();

      const panel = document.getElementById(controls!);
      expect(panel).not.toBeNull();
      expect(panel!.getAttribute("aria-labelledby")).toBe(tab.id);
    }

    const focusable = tabs.filter((t) => t.getAttribute("tabindex") === "0");
    expect(focusable).toHaveLength(1);
    const nonFocusable = tabs.filter((t) => t.getAttribute("tabindex") === "-1");
    expect(nonFocusable).toHaveLength(6);
  });

  it("renders the general settings pane with controls", async () => {
    const user = userEvent.setup();
    render(<Settings chatApi={api} />);

    await user.click(screen.getByRole("tab", { name: "General" }));

    const panel = screen.getByRole("tabpanel");
    expect(panel).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /always on top/i })).toBeInTheDocument();
    });
  });

  it("manages roving tabindex when selection changes via click", async () => {
    const user = userEvent.setup();
    render(<Settings chatApi={api} />);

    await user.click(screen.getByRole("tab", { name: "Themes" }));

    const themes = screen.getByRole("tab", { name: "Themes" });
    expect(themes).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "API Keys" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });
});
