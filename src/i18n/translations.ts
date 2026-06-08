export type Locale = "en" | "ru";

export type TranslationKey =
  | "alwaysOnTop"
  | "position"
  | "trackLast"
  | "pinCurrent"
  | "pin"
  | "language"
  | "loading"
  | "error";

export const translations: Record<Locale, Record<TranslationKey, string>> = {
  en: {
    alwaysOnTop: "Always on top",
    position: "Window position",
    trackLast: "Track last position",
    pinCurrent: "Pin current position",
    pin: "Pin",
    language: "Language",
    loading: "Loading...",
    error: "Failed to load general settings.",
  },
  ru: {
    alwaysOnTop: "Поверх всех окон",
    position: "Положение окна",
    trackLast: "Запоминать позицию",
    pinCurrent: "Зафиксировать позицию",
    pin: "Зафиксировать",
    language: "Язык",
    loading: "Загрузка...",
    error: "Не удалось загрузить настройки.",
  },
};

export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
};
