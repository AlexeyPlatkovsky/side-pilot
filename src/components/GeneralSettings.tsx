import { useState, useEffect, useCallback, useRef } from "react";
import type { ChatApi } from "../chat/api";
import type { GeneralPreferences } from "../chat/generated/GeneralPreferences";
import type { PositionMode } from "../chat/generated/PositionMode";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useI18n } from "../i18n/useI18n";
import type { Locale } from "../i18n/translations";

type LanguageOption = { code: Locale; name: string };

const LANGUAGES: LanguageOption[] = [
  { code: "en" as Locale, name: "English" },
  { code: "ru" as Locale, name: "Russian" },
].sort((a, b) => a.name.localeCompare(b.name));

export interface GeneralSettingsProps {
  api: ChatApi;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; prefs: GeneralPreferences }
  | { kind: "error"; message: string };

export function GeneralSettings({ api }: GeneralSettingsProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  const langCode: Locale =
    loadState.kind === "loaded"
      ? (loadState.prefs.language as Locale)
      : "en";
  const { t } = useI18n(langCode);

  useEffect(() => {
    let cancelled = false;
    api
      .getGeneralPreferences()
      .then((prefs) => {
        if (!cancelled) setLoadState({ kind: "loaded", prefs });
      })
      .catch((err) => {
        if (!cancelled) setLoadState({ kind: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!langOpen) return;
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [langOpen]);

  const persist = useCallback(
    async (prefs: GeneralPreferences) => {
      try {
        const saved = await api.updateGeneralPreferences(prefs);
        setLoadState({ kind: "loaded", prefs: saved });
      } catch {
        setLoadState({ kind: "loaded", prefs });
      }
    },
    [api],
  );

  const handleAlwaysOnTop = useCallback(
    async (checked: boolean) => {
      if (loadState.kind !== "loaded") return;
      await getCurrentWindow().setAlwaysOnTop(checked);
      const next = { ...loadState.prefs, alwaysOnTop: checked };
      setLoadState({ kind: "loaded", prefs: next });
      await persist(next);
    },
    [loadState, persist],
  );

  const handlePositionMode = useCallback(
    async (mode: PositionMode) => {
      if (loadState.kind !== "loaded") return;
      const next = { ...loadState.prefs, positionMode: mode };
      setLoadState({ kind: "loaded", prefs: next });
      await persist(next);
    },
    [loadState, persist],
  );

  const handlePin = useCallback(async () => {
    if (loadState.kind !== "loaded") return;
    const pos = await getCurrentWindow().outerPosition();
    const next = { ...loadState.prefs, pinnedPosition: { x: pos.x, y: pos.y } };
    setLoadState({ kind: "loaded", prefs: next });
    await persist(next);
  }, [loadState, persist]);

  const handleLanguage = useCallback(
    async (lang: Locale) => {
      if (loadState.kind !== "loaded") return;
      setLangOpen(false);
      const next = { ...loadState.prefs, language: lang };
      setLoadState({ kind: "loaded", prefs: next });
      await persist(next);
    },
    [loadState, persist],
  );

  if (loadState.kind === "loading") {
    return <p className="settings-pane__placeholder">{t("loading")}</p>;
  }

  if (loadState.kind === "error") {
    return <p className="settings-pane__placeholder">{t("error")}</p>;
  }

  const { prefs } = loadState;
  const currentLang = LANGUAGES.find((l) => l.code === prefs.language) ?? LANGUAGES[0];

  return (
    <div className="general-settings">
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={prefs.alwaysOnTop}
          onChange={(e) => handleAlwaysOnTop(e.target.checked)}
        />
        <span>{t("alwaysOnTop")}</span>
      </label>

      <fieldset className="settings-group">
        <legend>{t("position")}</legend>
        <label className="settings-radio">
          <input
            type="radio"
            name="positionMode"
            value="trackLast"
            checked={prefs.positionMode === "trackLast"}
            onChange={() => handlePositionMode("trackLast")}
          />
          <span>{t("trackLast")}</span>
        </label>
        <label className="settings-radio">
          <input
            type="radio"
            name="positionMode"
            value="pin"
            checked={prefs.positionMode === "pin"}
            onChange={() => handlePositionMode("pin")}
          />
          <span>{t("pinCurrent")}</span>
        </label>
        {prefs.positionMode === "pin" && (
          <button type="button" className="settings-btn" onClick={handlePin}>
            {t("pin")}
          </button>
        )}
      </fieldset>

      <label className="settings-field">
        <span>{t("language")}</span>
        <div className="lang-select" ref={langRef}>
          <button
            type="button"
            className="lang-select__current"
            onClick={() => setLangOpen((o) => !o)}
            aria-expanded={langOpen}
          >
            {currentLang.name}
          </button>
          {langOpen && (
            <div className="lang-select__menu" role="listbox">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  className={`lang-select__option${lang.code === prefs.language ? " lang-select__option--active" : ""}`}
                  role="option"
                  aria-selected={lang.code === prefs.language}
                  onClick={() => handleLanguage(lang.code)}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </label>
    </div>
  );
}
