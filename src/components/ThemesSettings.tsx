import { useState, useEffect } from "react";
import type { ChatApi } from "../chat/api";
import { THEMES, THEME_LABELS, applyTheme, isValidTheme, type ThemeId } from "../theme";
import type { GeneralPreferences } from "../chat/generated/GeneralPreferences";

export interface ThemesSettingsProps {
  api: ChatApi;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; prefs: GeneralPreferences; saveError: string | null }
  | { kind: "error"; message: string };

export function ThemesSettings({ api }: ThemesSettingsProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    api
      .getGeneralPreferences()
      .then((prefs) => {
        if (!cancelled) setState({ kind: "loaded", prefs, saveError: null });
      })
      .catch(() => {
        if (!cancelled)
          setState({ kind: "error", message: "Could not load preferences." });
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function handleSelect(theme: ThemeId) {
    if (state.kind !== "loaded") return;
    applyTheme(theme);
    const updated: GeneralPreferences = { ...state.prefs, theme };
    setState({ kind: "loaded", prefs: { ...state.prefs, theme }, saveError: null });
    try {
      const saved = await api.updateGeneralPreferences(updated);
      setState({ kind: "loaded", prefs: saved, saveError: null });
    } catch {
      setState((prev) =>
        prev.kind === "loaded"
          ? { ...prev, saveError: "Could not save theme preference." }
          : prev,
      );
    }
  }

  if (state.kind === "loading")
    return <p className="settings-pane__placeholder">Loading…</p>;

  if (state.kind === "error") {
    return (
      <p role="alert" className="settings-pane__error">
        {state.message}
      </p>
    );
  }

  const active = isValidTheme(state.prefs.theme) ? state.prefs.theme : "default";

  return (
    <div className="themes-settings">
      <fieldset className="themes-settings__fieldset">
        <legend className="themes-settings__legend">Select theme</legend>
        <div className="themes-settings__options">
          {THEMES.map((theme) => (
            <label key={theme} className="themes-settings__option">
              <input
                type="radio"
                name="app-theme"
                value={theme}
                checked={active === theme}
                onChange={() => handleSelect(theme)}
                className="themes-settings__radio"
              />
              <span className="themes-settings__label">{THEME_LABELS[theme]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {state.saveError && (
        <p role="alert" className="settings-pane__error">
          {state.saveError}
        </p>
      )}
    </div>
  );
}
