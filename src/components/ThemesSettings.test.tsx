import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemesSettings } from "./ThemesSettings";
import type { ChatApi } from "../chat/api";
import type { GeneralPreferences } from "../chat/generated/GeneralPreferences";

function defaultGeneral(theme = "default"): GeneralPreferences {
  return {
    alwaysOnTop: true,
    positionMode: "trackLast",
    pinnedPosition: null,
    lastKnownPosition: null,
    language: "en",
    theme,
  };
}

function buildApi(overrides: Partial<ChatApi> = {}): ChatApi {
  return {
    getGeneralPreferences: vi.fn().mockResolvedValue(defaultGeneral()),
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
    detectClis: vi.fn().mockResolvedValue([]),
    getCliIntegrations: vi.fn(),
    updateCliIntegrations: vi.fn(),
    testCustomCli: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemesSettings", () => {
  it("shows all three theme options", async () => {
    render(<ThemesSettings api={buildApi()} />);
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /default/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /cyberpunk/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /minimalist/i })).toBeInTheDocument();
    });
  });

  it("marks the loaded theme as selected", async () => {
    const api = buildApi({
      getGeneralPreferences: vi.fn().mockResolvedValue(defaultGeneral("cyberpunk")),
    });
    render(<ThemesSettings api={api} />);
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /cyberpunk/i })).toBeChecked();
      expect(screen.getByRole("radio", { name: /default/i })).not.toBeChecked();
    });
  });

  it("applying a theme calls updateGeneralPreferences with the new theme", async () => {
    const updateGeneralPreferences = vi
      .fn()
      .mockImplementation((v) => Promise.resolve(v));
    const api = buildApi({ updateGeneralPreferences });
    render(<ThemesSettings api={api} />);

    await screen.findByRole("radio", { name: /cyberpunk/i });
    await userEvent.click(screen.getByRole("radio", { name: /cyberpunk/i }));

    await waitFor(() => {
      expect(updateGeneralPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "cyberpunk" }),
      );
    });
  });

  it("applying a theme immediately sets the data-theme attribute", async () => {
    render(<ThemesSettings api={buildApi()} />);
    await screen.findByRole("radio", { name: /cyberpunk/i });
    await userEvent.click(screen.getByRole("radio", { name: /cyberpunk/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("cyberpunk");
  });

  it("selecting default removes the data-theme attribute", async () => {
    document.documentElement.setAttribute("data-theme", "cyberpunk");
    const api = buildApi({
      getGeneralPreferences: vi.fn().mockResolvedValue(defaultGeneral("cyberpunk")),
    });
    render(<ThemesSettings api={api} />);
    await screen.findByRole("radio", { name: /default/i });
    await userEvent.click(screen.getByRole("radio", { name: /default/i }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("shows a loading placeholder initially (no radios visible)", () => {
    const api = buildApi({
      getGeneralPreferences: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<ThemesSettings api={api} />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows an error when preferences cannot be loaded", async () => {
    const api = buildApi({
      getGeneralPreferences: vi.fn().mockRejectedValue(new Error("fail")),
    });
    render(<ThemesSettings api={api} />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("persist failure shows an error but keeps the applied theme", async () => {
    const updateGeneralPreferences = vi.fn().mockRejectedValue(new Error("disk full"));
    const api = buildApi({ updateGeneralPreferences });
    render(<ThemesSettings api={api} />);

    await screen.findByRole("radio", { name: /cyberpunk/i });
    await userEvent.click(screen.getByRole("radio", { name: /cyberpunk/i }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("cyberpunk");
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
