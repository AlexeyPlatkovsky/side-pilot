import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

function loadStylesheet(path: string): string {
  const content = readFileSync(path, "utf8");
  const dir = dirname(path);
  return content.replace(/@import\s+"([^"]+)";/g, (_, importPath: string) => {
    const resolved = resolve(dir, importPath);
    return loadStylesheet(resolved);
  });
}

const styles = loadStylesheet("src/styles.css");

function cssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(styles);
  return match?.[1] ?? "";
}

function cssDeclaration(rule: string, property: string): string | undefined {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)\\s*${escapedProperty}\\s*:\\s*([^;]+)`).exec(rule);
  return match?.[1]?.trim();
}

function rgbaAlpha(value: string): number | undefined {
  const match = /rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)/.exec(value);
  return match ? Number(match[1]) : undefined;
}

// Resolves a design token (e.g. "--surface-panel") from the :root block so guards
// can follow values that components reference indirectly via var().
function rootToken(name: string): string | undefined {
  return cssDeclaration(cssRule(":root"), name);
}

describe("floating shell styles", () => {
  it("keeps the full-window bubble shell transparent", () => {
    const bubbleRule = cssRule(".bubble");

    expect(cssDeclaration(bubbleRule, "background")).toBe("transparent");
  });

  it("does not paint outside the circular bubble shape", () => {
    const dotRule = cssRule(".bubble__dot");

    expect(cssDeclaration(dotRule, "box-shadow")).toBe("none");
  });

  it("does not paint outside the rounded panel shape", () => {
    const panelRule = cssRule(".panel");

    expect(cssDeclaration(panelRule, "box-shadow")).toBe("none");
  });

  it("uses a visible panel surface without making the corners opaque", () => {
    const panelRule = cssRule(".panel");
    const background = cssDeclaration(panelRule, "background");

    // The panel references the surface token; the token must stay translucent so
    // the rounded corners never paint an opaque square on the transparent window.
    expect(background).toBe("var(--surface-panel)");
    expect(rgbaAlpha(rootToken("--surface-panel")!)).toBeLessThanOrEqual(0.95);
  });
});

describe("settings button styles", () => {
  it("uses readable semantic colors for secondary actions", () => {
    const buttonRule = cssRule(".settings-btn");

    expect(cssDeclaration(buttonRule, "background")).toBe("var(--surface-raised)");
    expect(cssDeclaration(buttonRule, "border")).toBe("1px solid var(--border-soft)");
    expect(cssDeclaration(buttonRule, "color")).toBe("var(--color-text)");
  });
});

describe("icon filter token", () => {
  it("defaults to none in root so light-theme PNG icons are unaffected", () => {
    expect(rootToken("--icon-filter")).toBe("none");
  });

  it("inverts icons on cyberpunk dark theme", () => {
    const rule = cssRule('[data-theme="cyberpunk"]');
    expect(cssDeclaration(rule, "--icon-filter")).toBe("invert(1)");
  });

  it("inverts icons on midnight dark theme", () => {
    const rule = cssRule('[data-theme="midnight"]');
    expect(cssDeclaration(rule, "--icon-filter")).toBe("invert(1)");
  });

  it("inverts icons on retro dark theme", () => {
    const rule = cssRule('[data-theme="retro"]');
    expect(cssDeclaration(rule, "--icon-filter")).toBe("invert(1)");
  });

  it("applies icon filter to CLI button icon images", () => {
    const rule = cssRule(".cli-btn-icon img");
    expect(cssDeclaration(rule, "filter")).toBe("var(--icon-filter)");
  });

  it.each(["sepia", "forest", "minimalist", "high-contrast"])(
    "does not invert icons on %s light theme",
    (theme) => {
      const rule = cssRule(`[data-theme="${theme}"]`);
      expect(cssDeclaration(rule, "--icon-filter")).toBeUndefined();
    },
  );
});

describe("button hover and shape consistency", () => {
  it("settings button has rounded corners", () => {
    const rule = cssRule(".settings-btn");
    expect(cssDeclaration(rule, "border-radius")).toBe("var(--radius-sm)");
  });

  it("settings button shows hover background", () => {
    const rule = cssRule(".settings-btn:hover:not(:disabled)");
    expect(cssDeclaration(rule, "background")).toBe("var(--overlay-hover)");
  });

  it("AI switcher toggle shows hover background", () => {
    const rule = cssRule(".ai-switcher__toggle:hover:not(:disabled)");
    expect(cssDeclaration(rule, "background")).toBe("var(--overlay-hover)");
  });

  it("send button dims on hover", () => {
    const rule = cssRule(".composer__send:hover:not(:disabled)");
    expect(cssDeclaration(rule, "opacity")).toBe("0.88");
  });

  it("chat row menu button shows hover background", () => {
    const rule = cssRule(".chat-row__menu:hover");
    expect(cssDeclaration(rule, "background")).toBe("var(--overlay-hover)");
  });
});
