import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Toast, TOAST_DURATION_MS } from "./Toast";

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  it("renders the message as an aria-live status region", () => {
    render(<Toast message="Only 3 CLIs can be enabled at a time" onDismiss={() => {}} />);
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Only 3 CLIs can be enabled at a time");
    expect(toast).toHaveAttribute("aria-live", "polite");
  });

  it("auto-dismisses after the project-wide 3s default", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="hi" onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("respects an overridden duration", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="hi" durationMs={500} onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("clears its timer on unmount so a late tick cannot fire", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { unmount } = render(<Toast message="hi" onDismiss={onDismiss} />);
    unmount();
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS * 2);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
