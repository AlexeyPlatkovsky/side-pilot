import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const onMovedCallback = { current: null as ((event: unknown) => void) | null };

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setSize: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    outerPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
    onMoved: vi.fn().mockImplementation((cb: (event: unknown) => void) => {
      onMovedCallback.current = cb;
      return Promise.resolve(() => {
        onMovedCallback.current = null;
      });
    }),
    __onMovedCallback: onMovedCallback,
  }),
  LogicalSize: vi.fn(),
}));

// Satisfy the __TAURI_INTERNALS__ guard in Bubble's position-tracking effect.
Object.defineProperty(window, "__TAURI_INTERNALS__", {
  value: {},
  writable: true,
});

afterEach(() => {
  cleanup();
});
