import { useCallback } from "react";
import type { Locale, TranslationKey } from "./types";
import { translate } from "./translations";

export function useI18n(locale: Locale) {
  const t = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>): string => {
      return translate(locale, key, values);
    },
    [locale],
  );

  return { t };
}
