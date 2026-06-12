export const THEMES = ["default", "cyberpunk", "minimalist", "sepia", "forest", "midnight", "retro", "high-contrast"] as const;
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
