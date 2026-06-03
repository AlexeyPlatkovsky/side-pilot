import { describe, it, expect } from "vitest";
import { wasDragged, DRAG_THRESHOLD_PX } from "./drag";

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
    expect(wasDragged({ x: 0, y: 0 }, { x: DRAG_THRESHOLD_PX + 1, y: 0 })).toBe(
      true,
    );
  });

  it("detects a drag when the pointer moves beyond the threshold vertically", () => {
    expect(wasDragged({ x: 0, y: 0 }, { x: 0, y: DRAG_THRESHOLD_PX + 1 })).toBe(
      true,
    );
  });

  it("detects a drag regardless of direction (negative delta)", () => {
    expect(wasDragged({ x: 100, y: 100 }, { x: 100, y: 0 })).toBe(true);
  });

  it("honors a custom threshold", () => {
    expect(wasDragged({ x: 0, y: 0 }, { x: 20, y: 0 }, 50)).toBe(false);
    expect(wasDragged({ x: 0, y: 0 }, { x: 60, y: 0 }, 50)).toBe(true);
  });
});
