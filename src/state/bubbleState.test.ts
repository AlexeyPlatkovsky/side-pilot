import { describe, it, expect } from "vitest";
import {
  bubbleReducer,
  sizeFor,
  COLLAPSED_SIZE,
  EXPANDED_SIZE,
  type BubbleState,
} from "./bubbleState";

describe("bubbleReducer", () => {
  it("expands from collapsed", () => {
    expect(bubbleReducer("collapsed", "expand")).toBe("expanded");
  });

  it("collapses from expanded", () => {
    expect(bubbleReducer("expanded", "collapse")).toBe("collapsed");
  });

  it("toggle from collapsed opens the panel", () => {
    expect(bubbleReducer("collapsed", "toggle")).toBe("expanded");
  });

  it("toggle from expanded closes the panel", () => {
    expect(bubbleReducer("expanded", "toggle")).toBe("collapsed");
  });

  it("expand is idempotent", () => {
    expect(bubbleReducer("expanded", "expand")).toBe("expanded");
  });

  it("collapse is idempotent", () => {
    expect(bubbleReducer("collapsed", "collapse")).toBe("collapsed");
  });
});

describe("sizeFor", () => {
  it("returns the compact bubble size when collapsed", () => {
    expect(sizeFor("collapsed")).toEqual(COLLAPSED_SIZE);
  });

  it("returns the panel size when expanded", () => {
    expect(sizeFor("expanded")).toEqual(EXPANDED_SIZE);
  });

  it("the expanded panel is larger than the collapsed bubble", () => {
    expect(EXPANDED_SIZE.width).toBeGreaterThan(COLLAPSED_SIZE.width);
    expect(EXPANDED_SIZE.height).toBeGreaterThan(COLLAPSED_SIZE.height);
  });

  it("narrows the union type", () => {
    const states: BubbleState[] = ["collapsed", "expanded"];
    for (const s of states) {
      expect(sizeFor(s).width).toBeGreaterThan(0);
    }
  });
});
