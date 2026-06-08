import type { Locale, TranslationKey } from "./types";
import { en } from "./en";
import { ru } from "./ru";

export const translations: Record<Locale, Record<TranslationKey, string>> = {
  en,
  ru,
};

export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: Record<string, string | number>,
): string {
  let str = translations[locale]?.[key];
  if (str === undefined) {
    str = translations.en[key];
  }
  if (values && str) {
    for (const [k, v] of Object.entries(values)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str ?? key;
}

export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
};
