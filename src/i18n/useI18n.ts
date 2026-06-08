import { useCallback } from "react";
import type { Locale } from "./translations";
import { translations } from "./translations";
import type { TranslationKey } from "./translations";

export function useI18n(locale: Locale) {
  const t = useCallback(
    (key: TranslationKey): string => {
      return translations[locale]?.[key] ?? translations.en[key];
    },
    [locale],
  );

  return { t };
}
