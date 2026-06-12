import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import App from "./App";

// covers: SP-041 Scenario "Theme selection persists across restart" — front-end
// startup half: App reads the saved theme and applies it to <html> on mount.

const mockGetGeneralPreferences = vi.hoisted(() => vi.fn());

vi.mock("./chat/api", () => {
  const neverResolves = () => new Promise<never>(() => {});
  const shared = {
    getGeneralPreferences: mockGetGeneralPreferences,
    getCliIntegrations: vi.fn().mockResolvedValue({
      codex: { assistant: "codex", enabled: true, detectedStatus: "notDetected" },
      claude: { assistant: "claude", enabled: true, detectedStatus: "notDetected" },
      gemini: { assistant: "gemini", enabled: true, detectedStatus: "notDetected" },
      custom: [],
    }),
    listSessions: vi.fn().mockResolvedValue([]),
    runAdapter: neverResolves,
    runRoute: neverResolves,
    retryRoute: neverResolves,
    getProviderPreferences: neverResolves,
    updateProviderPreferences: neverResolves,
    updateGeneralPreferences: vi.fn().mockResolvedValue(undefined),
    createSession: neverResolves,
    appendMessage: neverResolves,
    readHistory: vi.fn().mockResolvedValue([]),
    renameSession: neverResolves,
    deleteSession: neverResolves,
    clearSession: neverResolves,
    updateCodexSessionId: neverResolves,
    openExternal: neverResolves,
    detectClis: vi.fn().mockResolvedValue([]),
    updateCliIntegrations: neverResolves,
    testCustomCli: neverResolves,
  };
  return {
    tauriChatApi: shared,
    inertChatApi: shared,
    describeError: vi.fn().mockReturnValue(""),
    toChatMessage: vi.fn().mockImplementation((row: unknown) => row),
  };
});

// @tauri-apps/api/window is mocked globally in vitest.setup.ts

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("App startup theme application", () => {
  beforeEach(() => {
    mockGetGeneralPreferences.mockReset();
  });

  it("applies a non-default saved theme to <html> on mount", async () => {
    // BVA: all calls (Bubble + App) must return the theme; use persistent mock
    mockGetGeneralPreferences.mockResolvedValue({
      alwaysOnTop: true,
      positionMode: "trackLast",
      pinnedPosition: null,
      lastKnownPosition: null,
      language: "en",
      theme: "cyberpunk",
    });

    render(<App />);

    await vi.waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("cyberpunk");
    });
  });

  it("does not set data-theme for the default theme", async () => {
    mockGetGeneralPreferences.mockResolvedValue({
      alwaysOnTop: true,
      positionMode: "trackLast",
      pinnedPosition: null,
      lastKnownPosition: null,
      language: "en",
      theme: "default",
    });

    render(<App />);

    await vi.waitFor(() => {
      expect(mockGetGeneralPreferences).toHaveBeenCalled();
    });
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("silently ignores a getGeneralPreferences failure on startup", async () => {
    mockGetGeneralPreferences.mockRejectedValue(new Error("backend unavailable"));

    expect(() => render(<App />)).not.toThrow();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
