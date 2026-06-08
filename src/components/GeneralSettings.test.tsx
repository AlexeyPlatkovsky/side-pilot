import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GeneralSettings } from "./GeneralSettings";
import type { ChatApi } from "../chat/api";
import type { GeneralPreferences } from "../chat/generated/GeneralPreferences";

const mockSetAlwaysOnTop = vi.fn();
const mockOuterPosition = vi.fn();

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setAlwaysOnTop: mockSetAlwaysOnTop,
    outerPosition: mockOuterPosition,
  }),
}));

function defaultGeneral(): GeneralPreferences {
  return {
    alwaysOnTop: true,
    positionMode: "trackLast",
    pinnedPosition: null,
    lastKnownPosition: null,
    language: "en",
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GeneralSettings", () => {
  it("loads and displays general preferences on mount (English)", async () => {
    const api = buildApi();
    render(<GeneralSettings api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /always on top/i })).toBeChecked();
    });
    expect(screen.getByText(/language/i)).toBeInTheDocument();
  });

  it("loads and displays Russian labels when language is ru", async () => {
    const api = buildApi({
      getGeneralPreferences: vi.fn().mockResolvedValue({ ...defaultGeneral(), language: "ru" }),
    });
    render(<GeneralSettings api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /поверх всех окон/i })).toBeChecked();
    });
  });

  it("toggles always-on-top and calls window API", async () => {
    const api = buildApi({
      getGeneralPreferences: vi.fn().mockResolvedValue({
        ...defaultGeneral(),
        alwaysOnTop: false,
      }),
    });
    const user = userEvent.setup();
    render(<GeneralSettings api={api} />);

    const toggle = await screen.findByRole("checkbox", { name: /always on top/i });
    await user.click(toggle);

    expect(mockSetAlwaysOnTop).toHaveBeenCalledWith(true);
    await waitFor(() => {
      expect(api.updateGeneralPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ alwaysOnTop: true }),
      );
    });
  });

  it("changes language via dropdown and persists", async () => {
    const api = buildApi();
    const user = userEvent.setup();
    render(<GeneralSettings api={api} />);

    const langButton = await screen.findByText("English");
    await user.click(langButton);

    await user.click(screen.getByRole("option", { name: "Russian" }));

    await waitFor(() => {
      expect(api.updateGeneralPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ language: "ru" }),
      );
    });
  });

  it("calls onLocaleChange when the language is changed", async () => {
    const api = buildApi();
    const onLocaleChange = vi.fn();
    const user = userEvent.setup();
    render(<GeneralSettings api={api} onLocaleChange={onLocaleChange} />);

    const langButton = await screen.findByText("English");
    await user.click(langButton);

    await user.click(screen.getByRole("option", { name: "Russian" }));

    await waitFor(() => {
      expect(onLocaleChange).toHaveBeenCalledWith("ru");
    });
  });

  it("shows position mode selector with trackLast as default", async () => {
    const api = buildApi();
    render(<GeneralSettings api={api} />);

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /track last position/i })).toBeChecked();
      expect(screen.getByRole("radio", { name: /pin current position/i })).not.toBeChecked();
    });
  });

  it("switches to pin mode and shows pin button", async () => {
    const api = buildApi();
    const user = userEvent.setup();
    render(<GeneralSettings api={api} />);

    const pinRadio = await screen.findByRole("radio", { name: /pin current position/i });
    await user.click(pinRadio);

    await waitFor(() => {
      expect(api.updateGeneralPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ positionMode: "pin" }),
      );
    });
    expect(screen.getByRole("button", { name: /pin/i })).toBeVisible();
  });

  it("pin button captures current position and persists", async () => {
    mockOuterPosition.mockResolvedValue({ x: 42, y: 84 });
    const api = buildApi({
      getGeneralPreferences: vi.fn().mockResolvedValue({
        ...defaultGeneral(),
        positionMode: "pin",
      }),
    });
    const user = userEvent.setup();
    render(<GeneralSettings api={api} />);

    const pinButton = await screen.findByRole("button", { name: /pin/i });
    await user.click(pinButton);

    await waitFor(() => {
      expect(mockOuterPosition).toHaveBeenCalled();
      expect(api.updateGeneralPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          pinnedPosition: { x: 42, y: 84 },
        }),
      );
    });
  });

  it("shows loading state while preferences load", () => {
    const api = buildApi({
      getGeneralPreferences: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<GeneralSettings api={api} />);

    expect(screen.getByText(/loading/i)).toBeVisible();
  });

  it("shows error state on load failure", async () => {
    const api = buildApi({
      getGeneralPreferences: vi.fn().mockRejectedValue(new Error("fail")),
    });
    render(<GeneralSettings api={api} />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeVisible();
    });
  });

  it("closes language dropdown on outside click", async () => {
    const api = buildApi();
    const user = userEvent.setup();
    render(<GeneralSettings api={api} />);

    const langButton = await screen.findByText("English");
    await user.click(langButton);
    expect(screen.getByRole("option", { name: "English" })).toBeVisible();

    await user.click(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
    });
  });
});
