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

  it("returns a distinct settings size when in the settings view", () => {
    expect(sizeFor("settings")).toEqual(SETTINGS_SIZE);
    expect(SETTINGS_SIZE).not.toEqual(EXPANDED_SIZE);
  });

  it("the settings view is at least as large as the expanded panel", () => {
    expect(SETTINGS_SIZE.width).toBeGreaterThanOrEqual(EXPANDED_SIZE.width);
    expect(SETTINGS_SIZE.height).toBeGreaterThanOrEqual(EXPANDED_SIZE.height);
  });

  it("narrows the union type", () => {
    const states: BubbleState[] = ["collapsed", "expanded", "settings"];
    for (const s of states) {
      expect(sizeFor(s).width).toBeGreaterThan(0);
    }
  });
});
