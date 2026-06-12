import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { THEMES, THEME_LABELS, THEME_SWATCHES, applyTheme, isValidTheme } from "./theme";

describe("theme constants", () => {
  it("THEMES contains all theme IDs", () => {
    expect(THEMES).toContain("default");
    expect(THEMES).toContain("cyberpunk");
    expect(THEMES).toContain("minimalist");
    expect(THEMES).toContain("sepia");
    expect(THEMES).toContain("forest");
    expect(THEMES).toContain("midnight");
    expect(THEMES).toContain("retro");
    expect(THEMES).toContain("high-contrast");
    expect(THEMES).toHaveLength(8);
  });

  it("THEME_LABELS has an entry for each theme", () => {
    for (const t of THEMES) {
      expect(THEME_LABELS[t]).toBeTruthy();
    }
  });

  it("uses five swatches drawn from each theme's actual palette", () => {
    const tokensCss = readFileSync("src/styles/tokens.css", "utf8");
    const themesCss = readFileSync("src/styles/themes.css", "utf8");

    for (const theme of THEMES) {
      const css =
        theme === "default"
          ? tokensCss.match(/:root\s*\{([^}]*)\}/)?.[1]
          : themesCss.match(
              new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`),
            )?.[1];

      expect(css, `${theme} theme block`).toBeDefined();
      expect(THEME_SWATCHES[theme], `${theme} swatch count`).toHaveLength(5);
      for (const swatch of THEME_SWATCHES[theme]) {
        expect(css, `${theme} palette should include ${swatch}`).toContain(swatch);
      }
    }
  });
});

describe("isValidTheme", () => {
  it("returns true for valid themes", () => {
    for (const theme of THEMES) {
      expect(isValidTheme(theme)).toBe(true);
    }
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

  it.each(THEMES.filter((theme) => theme !== "default"))(
    "sets data-theme attribute to %s",
    (theme) => {
      applyTheme(theme);
      expect(document.documentElement.getAttribute("data-theme")).toBe(theme);
    },
  );

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
