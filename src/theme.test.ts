import { describe, it, expect, beforeEach } from "vitest";
import { THEMES, THEME_LABELS, applyTheme, isValidTheme } from "./theme";

describe("theme constants", () => {
  it("THEMES contains default, cyberpunk, and minimalist", () => {
    expect(THEMES).toContain("default");
    expect(THEMES).toContain("cyberpunk");
    expect(THEMES).toContain("minimalist");
    expect(THEMES).toHaveLength(3);
  });

  it("THEME_LABELS has an entry for each theme", () => {
    for (const t of THEMES) {
      expect(THEME_LABELS[t]).toBeTruthy();
    }
  });
});

describe("isValidTheme", () => {
  it("returns true for valid themes", () => {
    expect(isValidTheme("default")).toBe(true);
    expect(isValidTheme("cyberpunk")).toBe(true);
    expect(isValidTheme("minimalist")).toBe(true);
  });

  it("returns false for unknown strings", () => {
    expect(isValidTheme("ocean")).toBe(false);
    expect(isValidTheme("")).toBe(false);
    expect(isValidTheme("DEFAULT")).toBe(false);
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("sets data-theme attribute to cyberpunk", () => {
    applyTheme("cyberpunk");
    expect(document.documentElement.getAttribute("data-theme")).toBe("cyberpunk");
  });

  it("sets data-theme attribute to minimalist", () => {
    applyTheme("minimalist");
    expect(document.documentElement.getAttribute("data-theme")).toBe("minimalist");
  });

  it("removes data-theme attribute for default", () => {
    document.documentElement.setAttribute("data-theme", "cyberpunk");
    applyTheme("default");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("falls back to default for an unrecognised theme string", () => {
    // EP: invalid/future stored value — widened to string so the guard is live
    applyTheme("ocean");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
