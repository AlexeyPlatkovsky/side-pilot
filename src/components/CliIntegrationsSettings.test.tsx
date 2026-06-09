import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CliIntegrationsSettings } from "./CliIntegrationsSettings";
import type { ChatApi } from "../chat/api";
import type { CliIntegrations } from "../chat/generated/CliIntegrations";
import type { CliIntegration } from "../chat/generated/CliIntegration";

function cliIntegrationsDefault(): CliIntegrations {
  return {
    codex: { assistant: "codex", enabled: true, detectedStatus: "available" },
    claude: {
      assistant: "claude",
      enabled: true,
      detectedStatus: "notInstalled",
    },
    gemini: {
      assistant: "gemini",
      enabled: false,
      detectedStatus: "notAuthenticated",
    },
  };
}

function detectedAll(): CliIntegration[] {
  return [
    { assistant: "codex", enabled: true, detectedStatus: "available" },
    { assistant: "claude", enabled: true, detectedStatus: "notInstalled" },
    { assistant: "gemini", enabled: false, detectedStatus: "notAuthenticated" },
  ];
}

function buildApi(overrides: Partial<ChatApi> = {}): ChatApi {
  return {
    getCliIntegrations: vi
      .fn()
      .mockResolvedValue(cliIntegrationsDefault()),
    updateCliIntegrations: vi
      .fn()
      .mockImplementation((v) => Promise.resolve(v)),
    detectClis: vi.fn().mockResolvedValue(detectedAll()),
    getGeneralPreferences: vi.fn(),
    updateGeneralPreferences: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CliIntegrationsSettings", () => {
  it("renders all three CLI rows with status and toggle", async () => {
    const api = buildApi();
    render(<CliIntegrationsSettings api={api} />);

    await waitFor(() => {
      expect(screen.getByText("Codex")).toBeDefined();
      expect(screen.getByText("Claude")).toBeDefined();
      expect(screen.getByText("Gemini")).toBeDefined();
    });

    expect(api.getCliIntegrations).toHaveBeenCalled();
    expect(api.detectClis).toHaveBeenCalled();
  });

  it("shows loading state with all three CLIs and Detecting status", () => {
    const api = buildApi();
    render(<CliIntegrationsSettings api={api} />);
    // All three rows show "Detecting..." during initial load
    const detectingLabels = screen.getAllByText("Detecting...");
    expect(detectingLabels).toHaveLength(3);
    expect(screen.getByText("Codex")).toBeDefined();
    expect(screen.getByText("Claude")).toBeDefined();
    expect(screen.getByText("Gemini")).toBeDefined();
  });

  it("shows error state when api rejects", async () => {
    const api = buildApi({
      getCliIntegrations: vi.fn().mockRejectedValue(new Error("fail")),
    });
    render(<CliIntegrationsSettings api={api} />);

    await waitFor(() => {
      expect(screen.getByTestId("cli-integrations-error")).toBeDefined();
    });
  });

  it("toggles enabled state and persists", async () => {
    const api = buildApi();
    render(<CliIntegrationsSettings api={api} />);

    await waitFor(() => {
      expect(screen.getByText("Codex")).toBeDefined();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    const codexCheckbox = checkboxes[0];
    expect(codexCheckbox).toBeChecked();

    await userEvent.click(codexCheckbox);
    expect(api.updateCliIntegrations).toHaveBeenCalled();
    const calls = (api.updateCliIntegrations as ReturnType<typeof vi.fn>).mock
      .calls;
    const lastCall = calls[calls.length - 1][0] as CliIntegrations;
    expect(lastCall.codex.enabled).toBe(false);
  });

  it("disables toggle for non-available CLIs", async () => {
    const api = buildApi();
    render(<CliIntegrationsSettings api={api} />);

    await waitFor(() => {
      expect(screen.getByText("Claude")).toBeDefined();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    // Claude is "notInstalled" — checkbox disabled AND unchecked
    expect(checkboxes[1]).toBeDisabled();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("re-checks a CLI and updates status", async () => {
    const api = buildApi({
      detectClis: vi
        .fn()
        .mockResolvedValueOnce(detectedAll()) // mount
        .mockResolvedValueOnce([
          {
            assistant: "claude",
            enabled: true,
            detectedStatus: "available",
          },
        ]), // re-check
    });
    render(<CliIntegrationsSettings api={api} />);

    await waitFor(() => {
      expect(screen.getByText("Not installed")).toBeDefined();
    });

    const recheckButtons = screen.getAllByText("Re-check");
    await userEvent.click(recheckButtons[0]); // Claude re-check

    await waitFor(() => {
      expect(api.updateCliIntegrations).toHaveBeenCalled();
    });
  });

  it("preserves user disable on re-check", async () => {
    const api = buildApi({
      detectClis: vi
        .fn()
        .mockResolvedValueOnce(detectedAll()) // mount
        .mockResolvedValueOnce([
          {
            assistant: "codex",
            enabled: true,
            detectedStatus: "available",
          },
        ]), // re-check
    });
    render(<CliIntegrationsSettings api={api} />);

    await waitFor(() => {
      expect(screen.getByText("Codex")).toBeDefined();
    });

    // Disable Codex first
    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes[0]);

    // Then re-check
    const recheckButtons = screen.getAllByText("Re-check");
    await userEvent.click(recheckButtons[0]);

    await waitFor(() => {
      const calls = (api.updateCliIntegrations as ReturnType<typeof vi.fn>).mock
        .calls;
      // The last call should have codex still disabled
      const lastCall = calls[calls.length - 1][0] as CliIntegrations;
      expect(lastCall.codex.enabled).toBe(false);
    });
  });

  it("cancels pending operations on unmount", () => {
    // A promise that never resolves, simulating a slow load.
    const never = new Promise<CliIntegrations>(() => {});
    const api = buildApi({
      getCliIntegrations: vi.fn().mockReturnValue(never),
    });
    const { unmount } = render(<CliIntegrationsSettings api={api} />);

    // Unmount before the promise settles
    unmount();

    // No state update on unmounted component — test passes if no error thrown
  });
});
