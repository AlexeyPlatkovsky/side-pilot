import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Color model
// ---------------------------------------------------------------------------
interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

const WHITE: Color = { r: 255, g: 255, b: 255, a: 1 };

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: Color): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(fg: Color, bg: Color): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function composite(fg: Color, bg: Color): Color {
  const a = fg.a;
  if (a >= 1) return fg;
  const inv = 1 - a;
  return {
    r: fg.r * a + bg.r * inv,
    g: fg.g * a + bg.g * inv,
    b: fg.b * a + bg.b * inv,
    a: Math.min(1, a + bg.a * inv),
  };
}

// ---------------------------------------------------------------------------
// CSS parser
// ---------------------------------------------------------------------------

function parseHex(h: string): Color {
  const raw = h.replace(/^#/, "");
  if (raw.length === 3) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
      a: 1,
    };
  }
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
    a: 1,
  };
}

const RGBA_RE = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/;

function parseRgba(s: string): Color | null {
  const m = RGBA_RE.exec(s);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
}

/** Extract CSS variable declarations from a block like `:root { … }`. */
function parseCssVars(css: string, selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "m");
  const match = re.exec(css);
  if (!match) return new Map();
  const body = match[1];
  const vars = new Map<string, string>();
  const declRe = /--[\w-]+:\s*[^;]+;/g;
  for (const decl of body.match(declRe) ?? []) {
    const colon = decl.indexOf(":");
    const name = decl.slice(0, colon).trim();
    const value = decl
      .slice(colon + 1)
      .trim()
      .replace(/;$/, "");
    if (value) vars.set(name, value);
  }
  return vars;
}

// Resolve a variable reference chain. `depth` prevents infinite loops.
function resolveRaw(name: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 10) throw new Error(`Circular var() chain: ${name}`);
  const v = vars.get(name);
  if (v === undefined) throw new Error(`Undefined var: ${name}`);
  // resolve any embedded var(...) references
  return v.replace(/var\(--([\w-]+)\)/g, (_, ref) =>
    resolveRaw(`--${ref}`, vars, depth + 1),
  );
}

/** Parse a single colour string (after var() resolution) to a Color. */
function parseColor(raw: string): Color {
  const s = raw.trim();
  if (s.startsWith("#")) return parseHex(s);
  const rgba = parseRgba(s);
  if (rgba) return rgba;
  // color-mix(in srgb, <color> <pct>%, transparent)
  const mixRe =
    /color-mix\(\s*in\s+srgb\s*,\s*(#[0-9a-fA-F]+|rgba\([^)]+\))\s+(\d+(?:\.\d+)?)%\s*,\s*transparent\s*\)/;
  const mix = mixRe.exec(s);
  if (mix) {
    const base = parseColor(mix[1]);
    const pct = +mix[2] / 100;
    return { r: base.r, g: base.g, b: base.b, a: pct };
  }
  throw new Error(`Cannot parse colour: ${raw}`);
}

/** Resolve every colour/surface variable in a map to a concrete Color. */
function resolveColourTokens(vars: Map<string, string>): Map<string, Color> {
  const colours = new Map<string, Color>();
  // First pass: direct hex / rgba
  for (const [name, raw] of vars) {
    const s = raw.trim();
    if (s.startsWith("#") || RGBA_RE.test(s)) {
      colours.set(name, parseColor(s));
    }
  }
  // Second pass: resolve var() chains and color-mix() for everything else
  for (const [name] of vars) {
    if (colours.has(name)) continue;
    if (
      name.startsWith("--space-") ||
      name.startsWith("--radius-") ||
      name.startsWith("--font-") ||
      name.startsWith("--icon-") ||
      name === "--focus-ring-width" ||
      name === "--focus-ring-offset" ||
      name.startsWith("--shadow-")
    )
      continue;
    try {
      const resolved = resolveRaw(name, vars);
      const color = parseColor(resolved);
      colours.set(name, color);
    } catch {
      // not a colour — skip
    }
  }
  return colours;
}

// ---------------------------------------------------------------------------
// Load themes
// ---------------------------------------------------------------------------

const TOKENS_CSS = readFileSync("src/styles/tokens.css", "utf8");
const THEMES_CSS = readFileSync("src/styles/themes.css", "utf8");
const ALL_CSS = TOKENS_CSS + "\n" + THEMES_CSS;

interface ThemeTokens {
  name: string;
  vars: Map<string, string>;
  colours: Map<string, Color>;
}

// Discover all theme selectors from the CSS: :root (default) + each [data-theme="…"] block
const themeNames: string[] = [
  "default",
  ...Array.from(ALL_CSS.matchAll(/\[data-theme="([^"]+)"\]/g))
    .map((m) => m[1])
    .filter((n) => n !== "..." && n.length <= 20),
];

const themeSelectors: [string, string][] = themeNames.map((name) =>
  name === "default"
    ? (["default", ":root"] as const)
    : ([name, `[data-theme="${name}"]`] as const),
);

const themes: ThemeTokens[] = themeSelectors.map(([name, sel]) => {
  const vars = parseCssVars(ALL_CSS, sel);
  const colours = resolveColourTokens(vars);
  return { name, vars, colours };
});

function c(theme: ThemeTokens, name: string): Color {
  const col = theme.colours.get(name);
  if (!col) throw new Error(`${theme.name}: ${name} not resolved`);
  return col;
}

// ---------------------------------------------------------------------------
// Layering model — how surfaces stack
// ---------------------------------------------------------------------------
// Each pair describes: fg text on bg surface.
// `bgLayers` is the background stack from base to top, e.g. ["white", "--surface-panel", "--overlay-hover"].

interface ContrastSpec {
  fg: string;
  bgLayers: string[];
  label: string;
  threshold: number;
}

const ALL_SPECS: ContrastSpec[] = [
  // Main panel (directly over assumed white desktop background behind transparent window)
  {
    fg: "--color-text",
    bgLayers: ["white", "--surface-panel"],
    label: "body text on panel",
    threshold: 4.5,
  },
  {
    fg: "--color-text-muted",
    bgLayers: ["white", "--surface-panel"],
    label: "muted text on panel",
    threshold: 4.5,
  },
  {
    fg: "--color-danger",
    bgLayers: ["white", "--surface-panel"],
    label: "danger text on panel",
    threshold: 4.5,
  },

  // Raised (e.g. assistant bubble) sits inside the panel
  {
    fg: "--color-text",
    bgLayers: ["white", "--surface-panel", "--surface-raised"],
    label: "body text on raised",
    threshold: 4.5,
  },
  {
    fg: "--color-text-muted",
    bgLayers: ["white", "--surface-panel", "--surface-raised"],
    label: "muted text on raised",
    threshold: 4.5,
  },
  {
    fg: "--color-danger",
    bgLayers: ["white", "--surface-panel", "--surface-raised"],
    label: "danger text on raised",
    threshold: 4.5,
  },
  {
    fg: "--color-link",
    bgLayers: ["white", "--surface-panel", "--surface-raised"],
    label: "link text on raised",
    threshold: 4.5,
  },

  // Header (warm surface over panel)
  {
    fg: "--color-text",
    bgLayers: ["white", "--surface-panel", "--surface-warm"],
    label: "body text on header",
    threshold: 4.5,
  },
  {
    fg: "--color-text-muted",
    bgLayers: ["white", "--surface-panel", "--surface-warm"],
    label: "muted text on header",
    threshold: 4.5,
  },

  // User bubble — accent bg, on-accent text
  {
    fg: "--color-on-accent",
    bgLayers: ["--color-accent"],
    label: "on-accent text on accent",
    threshold: 4.5,
  },
  {
    fg: "--color-on-accent-muted",
    bgLayers: ["--color-accent"],
    label: "on-accent muted on accent",
    threshold: 4.5,
  },

  // Hover interaction — overlay on panel
  {
    fg: "--color-text",
    bgLayers: ["white", "--surface-panel", "--overlay-hover"],
    label: "body text on hover overlay",
    threshold: 3,
  },

  // Error surface
  {
    fg: "--color-danger",
    bgLayers: ["white", "--surface-panel", "--surface-danger"],
    label: "danger text on error surface",
    threshold: 3,
  },

  // Unread dot — UI component on various surfaces
  {
    fg: "--color-unread",
    bgLayers: ["white", "--surface-panel", "--surface-raised"],
    label: "unread dot on raised",
    threshold: 3,
  },
  {
    fg: "--color-unread",
    bgLayers: ["white", "--surface-panel", "--tint-honey"],
    label: "unread dot on tint-honey",
    threshold: 3,
  },

  // Focus ring (2px outline) — needs 3:1 as UI indicator
  {
    fg: "--focus-ring",
    bgLayers: ["white", "--surface-panel"],
    label: "focus ring on panel",
    threshold: 3,
  },

  // Dialog text on panel (same as body text but explicit)
  {
    fg: "--color-text",
    bgLayers: ["white", "--surface-panel"],
    label: "dialog text on panel",
    threshold: 4.5,
  },
];

function effectiveBackground(theme: ThemeTokens, layers: string[]): Color {
  let current = layers[0] === "white" ? WHITE : c(theme, layers[0]);
  for (let i = 1; i < layers.length; i++) {
    current = composite(c(theme, layers[i]), current);
  }
  return current;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.each(themes)("Contrast — $name theme", (theme) => {
  it.each(ALL_SPECS)("$label: ≥ $threshold:1", (spec) => {
    const bg = effectiveBackground(theme, spec.bgLayers);
    const fg = c(theme, spec.fg);
    const ratio = contrastRatio(fg, bg);
    expect(
      ratio,
      `${theme.name}: ${spec.label}\n` +
        `  fg=${spec.fg}  → rgb(${fg.r.toFixed(0)},${fg.g.toFixed(0)},${fg.b.toFixed(0)})\n` +
        `  bg=${spec.bgLayers.join(" › ")}\n` +
        `     → rgb(${bg.r.toFixed(0)},${bg.g.toFixed(0)},${bg.b.toFixed(0)})\n` +
        `  ratio = ${ratio.toFixed(2)}:1  (threshold ${spec.threshold}:1)`,
    ).toBeGreaterThanOrEqual(spec.threshold);
  });
});

describe("High Contrast theme boundaries", () => {
  const theme = themes.find(({ name }) => name === "high-contrast");

  it.each([
    {
      token: "--border-soft",
      bgLayers: ["white", "--surface-panel"],
      label: "default control border",
    },
    {
      token: "--border-accent",
      bgLayers: ["white", "--surface-panel", "--surface-raised"],
      label: "accent control border",
    },
  ])("$label reaches 3:1 against its surface", ({ token, bgLayers }) => {
    expect(theme).toBeDefined();
    const bg = effectiveBackground(theme!, bgLayers);
    const ratio = contrastRatio(composite(c(theme!, token), bg), bg);
    expect(ratio, `${token} contrast = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });
});
