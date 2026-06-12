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
  const match = new RegExp(`${escapedProperty}\\s*:\\s*([^;]+)`).exec(rule);
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
