import { describe, it, expect } from "vitest";
import {
  bubbleReducer,
  sizeFor,
  COLLAPSED_SIZE,
  EXPANDED_SIZE,
  SETTINGS_SIZE,
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

  it("openSettings enters the settings view from the expanded panel", () => {
    expect(bubbleReducer("expanded", "openSettings")).toBe("settings");
  });

  it("openSettings does nothing from the collapsed bubble", () => {
    expect(bubbleReducer("collapsed", "openSettings")).toBe("collapsed");
  });

  it("closeSettings returns from settings to the expanded panel", () => {
    expect(bubbleReducer("settings", "closeSettings")).toBe("expanded");
  });

  it("closeSettings is a no-op when settings is not open", () => {
    expect(bubbleReducer("expanded", "closeSettings")).toBe("expanded");
    expect(bubbleReducer("collapsed", "closeSettings")).toBe("collapsed");
  });

  it("collapse still closes the shell from the settings view", () => {
    expect(bubbleReducer("settings", "collapse")).toBe("collapsed");
  });

  it("escape steps back from settings to the expanded panel", () => {
    expect(bubbleReducer("settings", "escape")).toBe("expanded");
  });

  it("escape collapses from the expanded panel", () => {
    expect(bubbleReducer("expanded", "escape")).toBe("collapsed");
  });

  it("escape is a no-op from the collapsed bubble", () => {
    expect(bubbleReducer("collapsed", "escape")).toBe("collapsed");
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

  it("uses the same size as the expanded panel in the settings view", () => {
    // Settings is an in-panel sub-view, not a separate window, so opening it
    // must not resize the window away from the main panel size.
    expect(sizeFor("settings")).toEqual(EXPANDED_SIZE);
  });

  it("keeps the settings size identical to the expanded panel size", () => {
    expect(SETTINGS_SIZE).toEqual(EXPANDED_SIZE);
  });

  it("narrows the union type", () => {
    const states: BubbleState[] = ["collapsed", "expanded", "settings"];
    for (const s of states) {
      expect(sizeFor(s).width).toBeGreaterThan(0);
    }
  });
});
