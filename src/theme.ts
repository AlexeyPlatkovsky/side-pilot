export const THEMES = [
  "default",
  "cyberpunk",
  "minimalist",
  "sepia",
  "forest",
  "midnight",
  "retro",
  "high-contrast",
] as const;
export type ThemeId = (typeof THEMES)[number];

export const THEME_LABELS: Record<ThemeId, string> = {
  default: "Default",
  cyberpunk: "Cyberpunk",
  minimalist: "Minimalist",
  sepia: "Sepia",
  forest: "Forest",
  midnight: "Midnight",
  retro: "Retro Terminal",
  "high-contrast": "High Contrast",
};

export const THEME_SWATCHES: Record<ThemeId, string[]> = {
  default: ["#b74f30", "#f7b955", "#dc6b4f", "#6b8f83", "#2f6f63"],
  cyberpunk: ["#030310", "#eef4ff", "#00e8ff", "#ff4d9a", "#ffe047"],
  minimalist: ["#fafafa", "#1a1a1a", "#3a6060", "#c04040", "#d4c8b0"],
  sepia: ["#f5e6c8", "#3d2b1f", "#7a3f28", "#b85c4a", "#d4a04a"],
  forest: ["#d6ead2", "#17351f", "#236247", "#b05a40", "#c4a040"],
  midnight: ["#1a1e28", "#e0e4e8", "#6a9ad0", "#d06060", "#c8b060"],
  retro: ["#0a120a", "#90c090", "#50b080", "#d0b040", "#c06050"],
  "high-contrast": ["#ffffff", "#000000", "#0047b3", "#cc3333", "#b8860b"],
};

export function isValidTheme(value: string): value is ThemeId {
  return (THEMES as readonly string[]).includes(value);
}

export function applyTheme(theme: string): void {
  if (!isValidTheme(theme)) {
    document.documentElement.removeAttribute("data-theme");
    return;
  }
  if (theme === "default") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}
