import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { wasDragged, DRAG_THRESHOLD_PX, useClickVsDrag } from "./drag";
import type { MouseEvent as ReactMouseEvent } from "react";

/** Minimal stand-in for the screen coordinates the hook reads off an event. */
const at = (x: number, y: number) => ({ screenX: x, screenY: y }) as ReactMouseEvent;

describe("wasDragged", () => {
  it("treats no movement as a click, not a drag", () => {
    expect(wasDragged({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false);
  });

  it("treats sub-threshold jitter as a click", () => {
    expect(
      wasDragged({ x: 0, y: 0 }, { x: DRAG_THRESHOLD_PX, y: DRAG_THRESHOLD_PX }),
    ).toBe(false);
  });

  it("detects a drag when the pointer moves beyond the threshold horizontally", () => {
    expect(wasDragged({ x: 0, y: 0 }, { x: DRAG_THRESHOLD_PX + 1, y: 0 })).toBe(true);
  });

  it("detects a drag when the pointer moves beyond the threshold vertically", () => {
    expect(wasDragged({ x: 0, y: 0 }, { x: 0, y: DRAG_THRESHOLD_PX + 1 })).toBe(true);
  });

  it("detects a drag regardless of direction (negative delta)", () => {
    expect(wasDragged({ x: 100, y: 100 }, { x: 100, y: 0 })).toBe(true);
  });

  it("honors a custom threshold", () => {
    expect(wasDragged({ x: 0, y: 0 }, { x: 20, y: 0 }, 50)).toBe(false);
    expect(wasDragged({ x: 0, y: 0 }, { x: 60, y: 0 }, 50)).toBe(true);
  });
});

describe("useClickVsDrag", () => {
  it("invokes the action on a press-and-release in place", () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useClickVsDrag(onClick));

    result.current.onMouseDown(at(12, 12));
    result.current.onClick(at(12, 12));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("ignores a click whose press started far away (a window drag)", () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useClickVsDrag(onClick));

    result.current.onMouseDown(at(0, 0));
    result.current.onClick(at(80, 40));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not fire on a click with no preceding press origin", () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useClickVsDrag(onClick));

    // No onMouseDown recorded: a stray click should still expand (origin null
    // means "treat as a click"), matching the previous inline behavior.
    result.current.onClick(at(5, 5));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
